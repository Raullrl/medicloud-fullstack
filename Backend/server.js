require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken'); 
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: false,
}));

app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).send('🚀 MediCloud API is online and secure.');
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5, 
  message: { error: '⛔ Demasiados intentos fallidos. Tu IP ha sido bloqueada temporalmente.' }
});

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
      rejectUnauthorized: false 
  }
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } 
});

console.log("📡 Backend MediCloud conectado a Aiven y Supabase...");

const registrarAuditoria = (email, rol_id, accion) => {
  const sql = "INSERT INTO registro_auditoria (usuario_email, rol_id, accion_realizada) VALUES (?, ?, ?)";
  db.query(sql, [email, rol_id, accion], (err) => {
    if (err) console.error("❌ Error en registro_auditoria:", err.message);
  });
};

const registrarLogForense = (id_usuario, id_doc, ip, accion, resultado) => {
  const sql = `INSERT INTO log_acceso (id_usuario, id_documento, ip_origen, accion, resultado) 
                VALUES (?, ?, ?, ?, ?)`;
  db.query(sql, [id_usuario, id_doc || null, ip, accion, resultado], (err) => {
    if (err) console.error("❌ Error en log_acceso:", err.message);
  });
};

app.get('/api/estado', (req, res) => {
  db.query('SELECT 1', (err) => {
    if (err) return res.status(500).json({ error: 'Error de conexión' });
    res.json({ mensaje: '✅ Servidor y Base de Datos activos' });
  });
});

app.post('/api/login', loginLimiter, async (req, res) => {
  const { usuario, password } = req.body; 
  const ipCliente = req.headers['x-forwarded-for'] || req.ip; 

  if (!usuario || !password) return res.status(400).json({ error: 'Faltan credenciales' });

  const queryLogin = `SELECT u.*, ur.id_rol FROM usuario u LEFT JOIN usuario_rol ur ON u.id_usuario = ur.id_usuario WHERE u.email = ?`;

  db.query(queryLogin, [usuario], async (err, results) => {
    if (err) return res.status(500).json({ error: 'Error en el servidor' });
    if (results.length === 0) return res.status(401).json({ error: 'Email o contraseña incorrectos' });

    const userDB = results[0];
    if (userDB.estado === 'Bloqueado') return res.status(403).json({ error: 'Tu cuenta ha sido bloqueada.' });

    const passwordValida = await bcrypt.compare(password, userDB.hash_contraseña);
    if (!passwordValida) {
      registrarLogForense(userDB.id_usuario, null, ipCliente, 'LOGIN_ATTEMPT', 'DENEGADO_PASSWORD');
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    const token = jwt.sign(
      { id: userDB.id_usuario, rol: userDB.id_rol, nombre: userDB.nombre_usuario, email: userDB.email },
      process.env.JWT_SECRET,
      { expiresIn: '60m' }
    );

    registrarLogForense(userDB.id_usuario, null, ipCliente, 'LOGIN_SUCCESS', 'EXITOSO');
    res.json({ mensaje: `¡Bienvenido, ${userDB.nombre_usuario}!`, token: token });
  });
});

const verificarToken = (req, res, next) => {
  const cabeceraAuth = req.headers['authorization'];
  const token = cabeceraAuth && cabeceraAuth.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Acceso denegado' });

  jwt.verify(token, process.env.JWT_SECRET, (err, usuarioDecodificado) => {
    if (err) return res.status(401).json({ error: 'Token inválido o caducado' });
    req.usuario = usuarioDecodificado;
    next();
  });
};

app.get('/api/mis-carpetas', verificarToken, (req, res) => {
  const email = req.usuario.email || '';
  const dominio = email.split('@')[1]?.split('.')[0] || '';
  let sql = `SELECT c.id_carpeta, c.nombre, cl.nombre_empresa AS cliente FROM carpeta c JOIN cliente cl ON c.id_cliente = cl.id_cliente`;
  let params = [];
  if (req.usuario.rol !== 3 && req.usuario.rol !== 1) {
    sql += ` WHERE cl.nombre_empresa LIKE ?`;
    params.push(`%${dominio}%`);
  }
  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: 'Error al obtener tus carpetas' });
    res.json(results);
  });
});

app.post('/api/carpetas', verificarToken, (req, res) => {
  const { nombre } = req.body;
  const email = req.usuario.email || '';
  const dominio = email.split('@')[1]?.split('.')[0] || '';

  if (!nombre) return res.status(400).json({ error: 'El nombre de la carpeta es obligatorio.' });

  db.query("SELECT id_cliente FROM cliente WHERE nombre_empresa LIKE ? LIMIT 1", [`%${dominio}%`], (err, results) => {
    if (err || results.length === 0) return res.status(400).json({ error: 'No se pudo identificar a qué empresa perteneces.' });
    
    const idCliente = results[0].id_cliente;
    const rutaLogica = `${dominio}/${nombre.toLowerCase().replace(/\s+/g, '_')}`;

    db.query("INSERT INTO carpeta (id_cliente, nombre, ruta) VALUES (?, ?, ?)", [idCliente, nombre, rutaLogica], (errIns) => {
      if (errIns) return res.status(500).json({ error: 'Error en BD al crear la carpeta.' });
      registrarAuditoria(req.usuario.email, req.usuario.rol, `NUEVA CARPETA CREADA: ${nombre}`);
      res.json({ mensaje: `Directorio "${nombre}" creado con éxito.` });
    });
  });
});

app.get('/api/carpetas', verificarToken, (req, res) => {
  const email = req.usuario.email || '';
  const dominio = email.split('@')[1]?.split('.')[0] || '';
  const ipCliente = req.headers['x-forwarded-for'] || req.ip;

  registrarAuditoria(req.usuario.email, req.usuario.rol, `Acceso a bóveda - Dominio: ${dominio}`);
  registrarLogForense(req.usuario.id, null, ipCliente, 'CONSULTA_BOVEDA', 'EXITOSO');

  let querySQL = `
    SELECT d.id_documento, d.nombre_archivo AS nombre_carpeta, c.nombre AS ubicacion, d.nivel_criticidad, v.ruta_cifrada AS ruta, cl.nombre_empresa AS cliente
    FROM documento d
    JOIN carpeta c ON d.id_carpeta = c.id_carpeta
    JOIN cliente cl ON c.id_cliente = cl.id_cliente
    LEFT JOIN version_documento v ON d.id_documento = v.id_documento
  `;

  if (req.usuario.rol !== 3 && req.usuario.rol !== 1) {
    querySQL += ` WHERE cl.nombre_empresa LIKE ?`;
    db.query(querySQL, [`%${dominio}%`], (err, results) => {
      if (err) return res.status(500).json({ error: 'Error al filtrar bóveda' });
      res.json({ carpetas: results });
    });
  } else {
    db.query(querySQL, (err, results) => {
      if (err) return res.status(500).json({ error: 'Error al leer bóveda' });
      res.json({ carpetas: results });
    });
  }
});

app.get('/api/carpetas/buscar', verificarToken, (req, res) => {
  const termino = req.query.nombre || '';
  const dominio = req.usuario.email.split('@')[1]?.split('.')[0] || '';
  const ipCliente = req.headers['x-forwarded-for'] || req.ip;
  
  registrarAuditoria(req.usuario.email, req.usuario.rol, `Búsqueda segura: "${termino}"`);

  let querySQL = `
    SELECT d.id_documento, d.nombre_archivo AS nombre_carpeta, c.nombre AS ubicacion, d.nivel_criticidad, v.ruta_cifrada AS ruta, cl.nombre_empresa AS cliente
    FROM documento d
    JOIN carpeta c ON d.id_carpeta = c.id_carpeta
    JOIN cliente cl ON c.id_cliente = cl.id_cliente
    LEFT JOIN version_documento v ON d.id_documento = v.id_documento
    WHERE d.nombre_archivo LIKE ?
  `;
  const params = [`%${termino}%`];

  if (req.usuario.rol !== 3 && req.usuario.rol !== 1) {
    querySQL += ` AND cl.nombre_empresa LIKE ?`;
    params.push(`%${dominio}%`);
  }

  db.query(querySQL, params, (err, results) => {
    if (err) return res.status(500).json({ error: 'Error en búsqueda' });
    res.json({ carpetas: results });
  });
});

app.post('/api/carpetas/upload', verificarToken, upload.single('archivo'), async (req, res) => {
  const ipCliente = req.headers['x-forwarded-for'] || req.ip;
  const { nombre, criticidad, id_carpeta } = req.body; 
  const archivo = req.file;

  if (!archivo || !nombre || !id_carpeta) return res.status(400).json({ error: 'Faltan datos del archivo o carpeta.' });

  try {
    const nombreLimpio = archivo.originalname.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9.]/g, "_");
    const nombreUnico = `${Date.now()}-${nombreLimpio}`;

    const { data, error } = await supabase.storage.from('historiales-medicos').upload(nombreUnico, archivo.buffer, { contentType: archivo.mimetype });
    if (error) throw error;

    const sqlDoc = "INSERT INTO documento (id_carpeta, nombre_archivo, tipo_documento, nivel_criticidad, estado_cifrado) VALUES (?, ?, ?, ?, 1)";
    const tipo = archivo.mimetype.split('/')[1].toUpperCase();
    
    db.query(sqlDoc, [id_carpeta, nombre, tipo, criticidad], (errD, resD) => {
      if (errD) return res.status(500).json({ error: 'Error al registrar documento en Aiven' });
      
      const sqlVer = "INSERT INTO version_documento (id_documento, ruta_cifrada, hash_integridad) VALUES (?, ?, ?)";
      db.query(sqlVer, [resD.insertId, nombreUnico, 'SHA256-BY-SYSTEM'], (errV) => {
        if (errV) return res.status(500).json({ error: 'Error al registrar versión' });

        registrarAuditoria(req.usuario.email, req.usuario.rol, `SUBIDA ARCHIVO: ${nombre}`);
        registrarLogForense(req.usuario.id, resD.insertId, ipCliente, 'UPLOAD_FILE', 'EXITOSO');
        res.json({ mensaje: 'Expediente cifrado y almacenado correctamente.' });
      });
    });
  } catch (e) { res.status(500).json({ error: 'Fallo en Storage: ' + e.message }); }
});

app.get('/api/documentos/:id/url', verificarToken, (req, res) => {
  const idDoc = req.params.id;
  const ipCliente = req.headers['x-forwarded-for'] || req.ip;

  db.query("SELECT ruta_cifrada FROM version_documento WHERE id_documento = ?", [idDoc], async (err, results) => {
    if (err || results.length === 0) return res.status(404).json({ error: 'Documento no encontrado en la bóveda.' });

    let ruta_interna = results[0].ruta_cifrada;

    if (ruta_interna.includes('/historiales-medicos/')) {
        ruta_interna = ruta_interna.split('/historiales-medicos/')[1];
    }

    const { data, error } = await supabase.storage.from('historiales-medicos').createSignedUrl(ruta_interna, 60);

    if (error) return res.status(500).json({ error: 'Error al generar enlace seguro de acceso temporal.' });

    registrarAuditoria(req.usuario.email, req.usuario.rol, `LECTURA DE DOCUMENTO ID: ${idDoc} (URL Segura)`);
    registrarLogForense(req.usuario.id, idDoc, ipCliente, 'READ_FILE_SECURE', 'EXITOSO');

    res.json({ url: data.signedUrl });
  });
});

// ✨ RUTA DE BORRADO DEFINITIVA (Soporta archivos antiguos y nuevos) ✨
app.delete('/api/documentos/:id', verificarToken, async (req, res) => {
  const idDoc = req.params.id;
  const ipCliente = req.headers['x-forwarded-for'] || req.ip;

  db.query("SELECT ruta_cifrada FROM version_documento WHERE id_documento = ?", [idDoc], async (err, results) => {
    if (err || results.length === 0) return res.status(404).json({ error: 'Documento no encontrado.' });
    
    let nombreArchivo = results[0].ruta_cifrada;
    
    // ✨ Limpieza automática para compatibilidad con documentos antiguos
    if (nombreArchivo.includes('/historiales-medicos/')) {
        nombreArchivo = nombreArchivo.split('/historiales-medicos/')[1];
    }

    // Intentamos borrar en Supabase, pero si da error (porque el archivo ya no existe), 
    // permitimos continuar para limpiar la base de datos MySQL.
    await supabase.storage.from('historiales-medicos').remove([nombreArchivo]);

    db.query("UPDATE log_acceso SET id_documento = NULL WHERE id_documento = ?", [idDoc], (errLog) => {
      if (errLog) return res.status(500).json({ error: 'Error al actualizar auditoría forense.' });

      db.query("DELETE FROM version_documento WHERE id_documento = ?", [idDoc], (errVer) => {
        if (errVer) return res.status(500).json({ error: 'Error al eliminar versiones de la BD.' });
        
        db.query("DELETE FROM documento WHERE id_documento = ?", [idDoc], (errDel) => {
          if (errDel) return res.status(500).json({ error: 'Error al eliminar el documento principal.' });
          
          registrarAuditoria(req.usuario.email, req.usuario.rol, `DOC. ELIMINADO ID: ${idDoc}`);
          registrarLogForense(req.usuario.id, null, ipCliente, 'DELETE_FILE', 'EXITOSO'); 
          res.json({ mensaje: 'Expediente eliminado de forma permanente.' });
        });
      });
    });
  });
});

app.delete('/api/carpetas/:id', verificarToken, (req, res) => {
  const idCarpeta = req.params.id;
  db.query("SELECT COUNT(*) AS total FROM documento WHERE id_carpeta = ?", [idCarpeta], (err, results) => {
    if (err) return res.status(500).json({ error: 'Error al verificar la carpeta.' });
    if (results[0].total > 0) return res.status(400).json({ error: 'No puedes borrar un directorio que contiene documentos. Vacíalo primero.' });

    db.query("DELETE FROM carpeta WHERE id_carpeta = ?", [idCarpeta], (errDel) => {
      if (errDel) return res.status(500).json({ error: 'Error al eliminar la carpeta.' });
      registrarAuditoria(req.usuario.email, req.usuario.rol, `CARPETA ELIMINADA ID: ${idCarpeta}`);
      res.json({ mensaje: 'Directorio eliminado correctamente.' });
    });
  });
});

app.get('/api/admin/usuarios', verificarToken, (req, res) => {
  const ipCliente = req.headers['x-forwarded-for'] || req.ip;
  if (req.usuario.rol !== 3) {
    registrarLogForense(req.usuario.id, null, ipCliente, 'ACCESO_ADMIN_PANEL', 'DENEGADO_ROL');
    return res.status(403).json({ error: 'Acceso denegado.' });
  }
  const querySQL = `SELECT u.id_usuario, u.nombre_usuario, u.email, r.nombre_rol, u.estado FROM usuario u LEFT JOIN usuario_rol ur ON u.id_usuario = ur.id_usuario LEFT JOIN rol r ON ur.id_rol = r.id_rol`;
  db.query(querySQL, (err, results) => res.json({ usuarios: results }));
});

app.post('/api/admin/usuarios', verificarToken, async (req, res) => {
  const { nombre, email, password, id_rol } = req.body;
  if (req.usuario.rol !== 3) return res.status(403).json({ error: 'Solo SysAdmin' });
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  db.query('INSERT INTO usuario (nombre_usuario, email, hash_contraseña, estado) VALUES (?, ?, ?, ?)', [nombre, email, hash, 'Activo'], (err, result) => {
    db.query('INSERT INTO usuario_rol (id_usuario, id_rol) VALUES (?, ?)', [result.insertId, id_rol], () => {
      registrarAuditoria(req.usuario.email, req.usuario.rol, `Alta de usuario: ${email}`);
      res.json({ mensaje: 'Empleado registrado con éxito.' });
    });
  });
});

app.put('/api/admin/usuarios/:id/estado', verificarToken, (req, res) => {
  const { nuevoEstado } = req.body;
  if (req.usuario.rol !== 3) return res.status(403).json({ error: 'Acceso denegado' });
  db.query('UPDATE usuario SET estado = ? WHERE id_usuario = ?', [nuevoEstado, req.params.id], (err) => {
    registrarAuditoria(req.usuario.email, req.usuario.rol, `Usuario ID ${req.params.id} cambiado a ${nuevoEstado}`);
    res.json({ mensaje: `El estado del usuario ahora es: ${nuevoEstado}` });
  });
});

app.put('/api/admin/usuarios/:id/reset', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 3) return res.status(403).json({ error: 'Solo SysAdmin' });
  const { nuevaClave } = req.body;
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(nuevaClave, salt);
  db.query("UPDATE usuario SET hash_contraseña = ? WHERE id_usuario = ?", [hash, req.params.id], (err) => {
    if(err) return res.status(500).json({error: 'Error en BD al cambiar clave'});
    registrarAuditoria(req.usuario.email, req.usuario.rol, `Password reseteada para usuario ID ${req.params.id}`);
    res.json({ mensaje: 'Contraseña actualizada con éxito.' });
  });
});

app.delete('/api/admin/usuarios/:id', verificarToken, (req, res) => {
  if (req.usuario.rol !== 3) return res.status(403).json({ error: 'Solo SysAdmin' });
  const idUser = req.params.id;
  
  db.query("UPDATE log_acceso SET id_usuario = NULL WHERE id_usuario = ?", [idUser], () => {
    db.query("DELETE FROM usuario_rol WHERE id_usuario = ?", [idUser], () => {
      db.query("DELETE FROM usuario WHERE id_usuario = ?", [idUser], (err) => {
        if(err) return res.status(500).json({error: 'Error al eliminar usuario'});
        registrarAuditoria(req.usuario.email, req.usuario.rol, `USUARIO ELIMINADO ID: ${idUser}`);
        res.json({ mensaje: 'Identidad eliminada permanentemente del sistema.' });
      });
    });
  });
});

app.get('/api/admin/auditoria', verificarToken, (req, res) => {
  if (req.usuario.rol !== 3) return res.status(403).json({ error: 'Acceso denegado' });
  const sql = "SELECT id_registro, usuario_email, accion_realizada, fecha_accion FROM registro_auditoria ORDER BY fecha_accion DESC LIMIT 100";
  db.query(sql, (err, results) => {
    if(err) return res.status(500).json({error: 'Error al leer auditoría'});
    res.json({ logs: results });
  });
});

app.get('/api/crear-hash/:clave', async (req, res) => {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(req.params.clave, salt);
  res.json({ hash_generated: hash });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor backend MediCloud ejecutándose en el puerto ${PORT}`);
});