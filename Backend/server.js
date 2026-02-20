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

// --- RUTA DE ESTADO ---
app.get('/api/estado', (req, res) => {
  db.query('SELECT 1', (err) => {
    if (err) return res.status(500).json({ error: 'Error de conexión' });
    res.json({ mensaje: '✅ Servidor y Base de Datos activos' });
  });
});

// --- RUTA DE LOGIN (BUSQUEDA POR EMAIL) ---
app.post('/api/login', loginLimiter, async (req, res) => {
  const { usuario, password } = req.body; 
  
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
    if (err) {
      console.error('❌ Error en Login:', err);
      return res.status(500).json({ error: 'Error en el servidor' });
    }

    if (results.length === 0) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    const userDB = results[0];

    if (userDB.estado === 'Bloqueado') {
      return res.status(403).json({ error: 'Tu cuenta ha sido bloqueada.' });
    }

    const passwordValida = await bcrypt.compare(password, userDB.hash_contraseña);
    if (!passwordValida) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    const token = jwt.sign(
      { 
        id: userDB.id_usuario, 
        rol: userDB.id_rol, 
        nombre: userDB.nombre_usuario,
        email: userDB.email 
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    console.log(`✅ Login exitoso: ${userDB.email} (Rol: ${userDB.id_rol})`);
    res.json({
      mensaje: `¡Bienvenido, ${userDB.nombre_usuario}!`,
      token: token
    });
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

// --- RUTA PROTEGIDA: CARPETAS (FILTRADO POR DOMINIO) ---
app.get('/api/carpetas', verificarToken, (req, res) => {
  const email = req.usuario.email || '';
  const dominio = email.split('@')[1]?.split('.')[0] || '';
  
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

// ✨ --- RUTA NUEVA: BÚSQUEDA SEGURA CONTRA INYECCIÓN SQL (SQLi) --- ✨
app.get('/api/carpetas/buscar', verificarToken, (req, res) => {
  const termino = req.query.nombre || '';
  const email = req.usuario.email || '';
  const dominio = email.split('@')[1]?.split('.')[0] || '';
  
  // CONSULTA PARAMETRIZADA: El signo '?' bloquea cualquier intento de Inyección SQL
  let querySQL = `
    SELECT c.id_carpeta, c.nombre AS nombre_carpeta, c.ruta, cl.nombre_empresa AS cliente
    FROM carpeta c
    JOIN cliente cl ON c.id_cliente = cl.id_cliente
    WHERE c.nombre LIKE ?
  `;
  const params = [`%${termino}%`];

  // Si no es SysAdmin (3) ni Gerencia (1), aplicamos también el filtro de seguridad de su dominio
  if (req.usuario.rol !== 3 && req.usuario.rol !== 1) {
    querySQL += ` AND cl.nombre_empresa LIKE ?`;
    params.push(`%${dominio}%`);
  }

  db.query(querySQL, params, (err, results) => {
    if (err) return res.status(500).json({ error: 'Error en la búsqueda segura' });
    res.json({ carpetas: results });
  });
});

// --- RUTA PROTEGIDA: PANEL DE ADMINISTRADOR (SOLO SYSADMIN) ---
app.get('/api/admin/usuarios', verificarToken, (req, res) => {
  if (req.usuario.rol !== 3) {
    return res.status(403).json({ error: 'Acceso denegado. Se requieren privilegios de Administrador Técnico (SysAdmin).' });
  }

  const querySQL = `
    SELECT u.id_usuario, u.nombre_usuario, u.email, r.nombre_rol, u.estado 
    FROM usuario u
    LEFT JOIN usuario_rol ur ON u.id_usuario = ur.id_usuario
    LEFT JOIN rol r ON ur.id_rol = r.id_rol
  `;

  db.query(querySQL, (err, results) => {
    if (err) return res.status(500).json({ error: 'Error del servidor al leer los usuarios' });
    res.json({ usuarios: results });
  });
});

app.get('/api/crear-hash/:clave', async (req, res) => {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(req.params.clave, salt);
  res.json({ hash_generado: hash });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend MediCloud ejecutándose en el puerto ${PORT}`);
});