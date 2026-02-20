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

// ✨ --- FUNCIÓN AUXILIAR PARA REGISTRO_ACCESO (FORENSE) --- ✨
// CORRECCIÓN: Se cambia Log_acceso por log_acceso para evitar errores de Case Sensitivity en Linux
const registrarLogForense = (id_usuario, id_doc, ip, accion, resultado) => {
  const sql = `INSERT INTO log_acceso (id_usuario, id_documento, ip_origen, accion, resultado) 
               VALUES (?, ?, ?, ?, ?)`;
  // Usamos null si no hay id_doc (como en el login o lista general)
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
  const ipCliente = req.headers['x-forwarded-for'] || req.ip; // Captura la IP real

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

    // Si el usuario no existe, no podemos registrarlo en log_acceso por la FK id_usuario
    if (results.length === 0) return res.status(401).json({ error: 'Email o contraseña incorrectos' });

    const userDB = results[0];

    if (userDB.estado === 'Bloqueado') {
      return res.status(403).json({ error: 'Tu cuenta ha sido bloqueada.' });
    }

    const passwordValida = await bcrypt.compare(password, userDB.hash_contraseña);
    if (!passwordValida) {
      // ✨ REGISTRO FORENSE: Fallo de contraseña
      registrarLogForense(userDB.id_usuario, null, ipCliente, 'LOGIN_ATTEMPT', 'DENEGADO_PASSWORD');
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    // LOGIN EXITOSO
    const token = jwt.sign(
      { id: userDB.id_usuario, rol: userDB.id_rol, nombre: userDB.nombre_usuario, email: userDB.email },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // ✨ REGISTRO FORENSE: Login correcto
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

// --- RUTA PROTEGIDA: CARPETAS (CON AUDITORÍA DUAL) ---
app.get('/api/carpetas', verificarToken, (req, res) => {
  const email = req.usuario.email || '';
  const dominio = email.split('@')[1]?.split('.')[0] || '';
  const ipCliente = req.headers['x-forwarded-for'] || req.ip;

  // ✨ REGISTRO AUDITORÍA (Tabla simple)
  const sqlLog = "INSERT INTO registro_auditoria (usuario_email, rol_id, accion_realizada) VALUES (?, ?, ?)";
  db.query(sqlLog, [email, req.usuario.rol, `Acceso a bóveda - Dominio: ${dominio}`]);

  // ✨ REGISTRO FORENSE (Tabla avanzada log_acceso)
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

// --- RUTA BÚSQUEDA SEGURA (CON AUDITORÍA DUAL) ---
app.get('/api/carpetas/buscar', verificarToken, (req, res) => {
  const termino = req.query.nombre || '';
  const email = req.usuario.email || '';
  const dominio = email.split('@')[1]?.split('.')[0] || '';
  const ipCliente = req.headers['x-forwarded-for'] || req.ip;
  
  // ✨ REGISTRO AUDITORÍA
  const sqlLog = "INSERT INTO registro_auditoria (usuario_email, rol_id, accion_realizada) VALUES (?, ?, ?)";
  db.query(sqlLog, [email, req.usuario.rol, `Búsqueda segura: "${termino}"`]);

  // ✨ REGISTRO FORENSE
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
    // ✨ REGISTRO FORENSE: Intento de intrusión por rol insuficiente
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend MediCloud ejecutándose en el puerto ${PORT}`);
});