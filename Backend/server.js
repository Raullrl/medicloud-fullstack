require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken'); 
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// 🛡️ Configuración para Render (Proxy)
app.set('trust proxy', 1);

// 🛡️ Seguridad de cabeceras
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

// --- CONFIGURACIÓN DE SEGURIDAD (CORS) ---
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// 🛡️ Limitador de Fuerza Bruta
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5, 
  message: { error: '⛔ Demasiados intentos fallidos. Tu IP ha sido bloqueada temporalmente.' }
});

// --- CONFIGURACIÓN DE LA BASE DE DATOS (AIVEN) ---
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

console.log("📡 Backend conectado a la base de datos de Aiven...");

// ✨ --- CORREGIDO: VOLVEMOS A USAR usuario_email PARA QUE COINCIDA CON TU BBDD --- ✨
const registrarAuditoria = (email, rol_id, accion) => {
  const sql = "INSERT INTO registro_auditoria (usuario_email, rol_id, accion_realizada) VALUES (?, ?, ?)";
  db.query(sql, [email, rol_id, accion], (err) => {
    if (err) console.error("❌ Error en registro_auditoria:", err.message);
  });
};

// ✨ --- FUNCIÓN AUXILIAR PARA REGISTRO_ACCESO (FORENSE) --- ✨
const registrarLogForense = (id_usuario, id_doc, ip, accion, resultado) => {
  const sql = `INSERT INTO log_acceso (id_usuario, id_documento, ip_origen, accion, resultado) 
               VALUES (?, ?, ?, ?, ?)`;
  db.query(sql, [id_usuario, id_doc || null, ip, accion, resultado], (err) => {
    if (err) console.error("❌ Error en log_acceso:", err.message);
  });
};

// --- RUTA DE ESTADO ---
app.get('/api/estado', (req, res) => {
  db.query('SELECT 1', (err) => {
    if (err) return res.status(500).json({ error: 'Error de conexión' });
    res.json({ mensaje: '✅ Servidor y Base de Datos activos' });
  });
});

// --- RUTA DE LOGIN ---
app.post('/api/login', loginLimiter, async (req, res) => {
  const { usuario, password } = req.body; 
  const ipCliente = req.headers['x-forwarded-for'] || req.ip; 

  if (!usuario || !password) {
    return res.status(400).json({ error: 'Faltan credenciales' });
  }

  const queryLogin = `
    SELECT u.*, ur.id_rol 
    FROM usuario u
    LEFT JOIN usuario_rol ur ON u.id_usuario = ur.id_usuario
    WHERE u.email = ?
  `;

  db.query(queryLogin, [usuario], async (err, results) => {
    if (err) return res.status(500).json({ error: 'Error en el servidor' });

    if (results.length === 0) return res.status(401).json({ error: 'Email o contraseña incorrectos' });

    const userDB = results[0];

    if (userDB.estado === 'Bloqueado') {
      return res.status(403).json({ error: 'Tu cuenta ha sido bloqueada.' });
    }

    const passwordValida = await bcrypt.compare(password, userDB.hash_contraseña);
    if (!passwordValida) {
      registrarLogForense(userDB.id_usuario, null, ipCliente, 'LOGIN_ATTEMPT', 'DENEGADO_PASSWORD');
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    const token = jwt.sign(
      { id: userDB.id_usuario, rol: userDB.id_rol, nombre: userDB.nombre_usuario, email: userDB.email },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    registrarLogForense(userDB.id_usuario, null, ipCliente, 'LOGIN_SUCCESS', 'EXITOSO');
    console.log(`✅ Login exitoso: ${userDB.email}`);
    res.json({ mensaje: `¡Bienvenido, ${userDB.nombre_usuario}!`, token: token });
  });
});

// --- MIDDLEWARE DE VERIFICACIÓN DE TOKEN ---
const verificarToken = (req, res, next) => {
  const cabeceraAuth = req.headers['authorization'];
  const token = cabeceraAuth && cabeceraAuth.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Acceso denegado' });

  jwt.verify(token, process.env.JWT_SECRET, (err, usuarioDecodificado) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.usuario = usuarioDecodificado;
    next();
  });
};

// --- RUTA PROTEGIDA: CARPETAS ---
app.get('/api/carpetas', verificarToken, (req, res) => {
  const email = req.usuario.email || '';
  const dominio = email.split('@')[1]?.split('.')[0] || '';
  const ipCliente = req.headers['x-forwarded-for'] || req.ip;

  registrarAuditoria(req.usuario.email, req.usuario.rol, `Acceso a bóveda - Dominio: ${dominio}`);
  registrarLogForense(req.usuario.id, null, ipCliente, 'CONSULTA_BOVEDA', 'EXITOSO');

  let querySQL = `
    SELECT c.id_carpeta, c.nombre AS nombre_carpeta, c.ruta, cl.nombre_empresa AS cliente
    FROM carpeta c
    JOIN cliente cl ON c.id_cliente = cl.id_cliente
  `;

  if (req.usuario.rol !== 3 && req.usuario.rol !== 1) {
    querySQL += ` WHERE cl.nombre_empresa LIKE ?`;
    db.query(querySQL, [`%${dominio}%`], (err, results) => {
      if (err) return res.status(500).json({ error: 'Error al filtrar bóveda' });
      res.json({ mensaje: "Bóveda filtrada por dominio", carpetas: results });
    });
  } else {
    db.query(querySQL, (err, results) => {
      if (err) return res.status(500).json({ error: 'Error al leer bóveda' });
      res.json({ mensaje: "Acceso total de administrador", carpetas: results });
    });
  }
});

// --- RUTA BÚSQUEDA SEGURA ---
app.get('/api/carpetas/buscar', verificarToken, (req, res) => {
  const termino = req.query.nombre || '';
  const dominio = req.usuario.email.split('@')[1]?.split('.')[0] || '';
  const ipCliente = req.headers['x-forwarded-for'] || req.ip;
  
  registrarAuditoria(req.usuario.email, req.usuario.rol, `Búsqueda segura: "${termino}"`);
  registrarLogForense(req.usuario.id, null, ipCliente, 'BUSQUEDA_EXPEDIENTE', 'EXITOSO');

  let querySQL = `
    SELECT c.id_carpeta, c.nombre AS nombre_carpeta, c.ruta, cl.nombre_empresa AS cliente
    FROM carpeta c
    JOIN cliente cl ON c.id_cliente = cl.id_cliente
    WHERE c.nombre LIKE ?
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

// --- RUTA PROTEGIDA: PANEL DE ADMINISTRADOR ---
app.get('/api/admin/usuarios', verificarToken, (req, res) => {
  const ipCliente = req.headers['x-forwarded-for'] || req.ip;

  if (req.usuario.rol !== 3) {
    registrarLogForense(req.usuario.id, null, ipCliente, 'ACCESO_ADMIN_PANEL', 'DENEGADO_ROL');
    return res.status(403).json({ error: 'Acceso denegado.' });
  }

  const querySQL = `
    SELECT u.id_usuario, u.nombre_usuario, u.email, r.nombre_rol, u.estado 
    FROM usuario u
    LEFT JOIN usuario_rol ur ON u.id_usuario = ur.id_usuario
    LEFT JOIN rol r ON ur.id_rol = r.id_rol
  `;

  db.query(querySQL, (err, results) => {
    if (err) return res.status(500).json({ error: 'Error' });
    res.json({ usuarios: results });
  });
});

app.get('/api/crear-hash/:clave', async (req, res) => {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(req.params.clave, salt);
  res.json({ hash_generated: hash });
});

// ✨ --- NUEVO: CREAR USUARIOS DESDE PANEL ---
app.post('/api/admin/usuarios', verificarToken, async (req, res) => {
  const ipCliente = req.headers['x-forwarded-for'] || req.ip;
  const { nombre, email, password, id_rol } = req.body;

  if (req.usuario.rol !== 3) {
    return res.status(403).json({ error: 'Solo SysAdmin puede crear usuarios.' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    db.query('INSERT INTO usuario (nombre_usuario, email, hash_contraseña, estado) VALUES (?, ?, ?, ?)', 
    [nombre, email, hash, 'Activo'], (err, result) => {
      if (err) return res.status(500).json({ error: 'Error SQL Insertar Usuario: ' + err.message });

      db.query('INSERT INTO usuario_rol (id_usuario, id_rol) VALUES (?, ?)', [result.insertId, id_rol], (err) => {
        if (err) return res.status(500).json({ error: 'Error SQL Asignar Rol: ' + err.message });
        
        registrarAuditoria(req.usuario.email, req.usuario.rol, `Alta de usuario: ${email}`);
        registrarLogForense(req.usuario.id, null, ipCliente, 'ALTA_USUARIO', 'EXITOSO');
        
        res.json({ mensaje: 'Empleado registrado con éxito en MediCloud.' });
      });
    });
  } catch (e) {
    res.status(500).json({ error: 'Error interno de cifrado' });
  }
});

// ✨ --- NUEVO: BLOQUEAR / ACTIVAR USUARIO ---
app.put('/api/admin/usuarios/:id/estado', verificarToken, (req, res) => {
  const { id } = req.params;
  const { nuevoEstado } = req.body;
  const ipCliente = req.headers['x-forwarded-for'] || req.ip;

  if (req.usuario.rol !== 3) return res.status(403).json({ error: 'Acceso denegado' });

  db.query('UPDATE usuario SET estado = ? WHERE id_usuario = ?', [nuevoEstado, id], (err) => {
    if (err) return res.status(500).json({ error: 'Error SQL al actualizar estado: ' + err.message });

    registrarAuditoria(req.usuario.email, req.usuario.rol, `Usuario ID ${id} cambiado a ${nuevoEstado}`);
    registrarLogForense(req.usuario.id, null, ipCliente, 'CAMBIO_ESTADO', nuevoEstado);
    
    res.json({ mensaje: `El estado del usuario ahora es: ${nuevoEstado}` });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend MediCloud ejecutándose en el puerto ${PORT}`);
});