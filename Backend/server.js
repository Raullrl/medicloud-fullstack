require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken'); 
// 🛡️ 1. Importamos nuestras nuevas armas de seguridad
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// 🛡️ 1. VITAL PARA RENDER: Le decimos que estamos detrás de un proxy 
// para que el Rate Limit lea tu IP real y no la de Render.
app.set('trust proxy', 1);

// 🛡️ 2. HELMET AJUSTADO: Lo activamos, pero le decimos que permita 
// recibir peticiones de otros orígenes (tu Vercel).
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

// --- CONFIGURACIÓN DE SEGURIDAD (CORS) ---
app.use(cors({
  origin: '*', // En un entorno 100% estricto aquí iría tu URL de Vercel
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// 🛡️ 3. LIMITADOR DE VELOCIDAD (Fuerza Bruta)
// Creamos una regla: Máximo 5 intentos de login por IP cada 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos de ventana
  max: 5, // Límite de 5 peticiones por IP
  message: { error: '⛔ Demasiados intentos fallidos. Tu IP ha sido bloqueada temporalmente. Inténtalo en 15 minutos.' }
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

console.log("📡 Intentando configurar el pool de conexiones a Aiven...");

// --- RUTA DE ESTADO (Para probar conexión) ---
app.get('/api/estado', (req, res) => {
  db.query('SELECT nombre, apellidos FROM empleado LIMIT 3', (err, results) => {
    if (err) {
      console.error('❌ Error en /api/estado:', err);
      return res.status(500).json({ error: 'Error conectando a Aiven' });
    }
    res.json({ mensaje: '✅ ¡Conexión exitosa a la nube de Aiven!', empleados: results });
  });
});

// --- RUTA DE LOGIN ---
// 🛡️ 4. Aplicamos el limitador SOLO a la ruta de login
app.post('/api/login', loginLimiter, async (req, res) => {
  const { usuario, password } = req.body;
  
  console.log(`📩 Intento de login recibido. Usuario: ${usuario}`);

  if (!usuario || !password) {
    return res.status(400).json({ error: 'Faltan credenciales' });
  }

  db.query('SELECT * FROM usuario WHERE nombre_usuario = ?', [usuario], async (err, results) => {
    if (err) {
      console.error('❌ Error de Base de Datos en Login:', err);
      return res.status(500).json({ error: 'Error en el servidor' });
    }

    if (results.length === 0) {
      console.log(`⚠️ Usuario no encontrado: ${usuario}`);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const userDB = results[0];

    if (userDB.estado === 'Bloqueado') {
      return res.status(403).json({ error: 'Tu cuenta ha sido bloqueada por seguridad.' });
    }

    const passwordValida = await bcrypt.compare(password, userDB.hash_contraseña);
    if (!passwordValida) {
      console.log(`❌ Contraseña incorrecta para: ${usuario}`);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    // Creación del Token JWT (Caduca en 2 horas, control de sesiones implementado)
    const token = jwt.sign(
      { id: userDB.id_usuario, rol: userDB.id_rol, nombre: userDB.nombre_usuario },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    console.log(`✅ Login exitoso: ${usuario}`);
    res.json({
      mensaje: `¡Bienvenido a MediCloud, ${userDB.nombre_usuario}!`,
      token: token
    });
  });
});

// --- MIDDLEWARE DE VERIFICACIÓN DE TOKEN ---
const verificarToken = (req, res, next) => {
  const cabeceraAuth = req.headers['authorization'];
  const token = cabeceraAuth && cabeceraAuth.split(' ')[1];

  if (!token) {
    console.log("⛔ Intento de acceso sin token");
    return res.status(401).json({ error: '⛔ Acceso denegado. Necesitas iniciar sesión.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, usuarioDecodificado) => {
    if (err) {
      console.error("⛔ Token inválido o caducado");
      return res.status(403).json({ error: '⛔ Token inválido o caducado.' });
    }

    req.usuario = usuarioDecodificado;
    next();
  });
};

// --- RUTA PROTEGIDA: CARPETAS ---
app.get('/api/carpetas', verificarToken, (req, res) => {
  console.log(`📂 Usuario ${req.usuario.nombre} solicitando carpetas...`);
  
  const querySQL = `
    SELECT 
      c.id_carpeta, 
      c.nombre AS nombre_carpeta, 
      c.ruta,
      cl.nombre_empresa AS cliente
    FROM carpeta c
    JOIN cliente cl ON c.id_cliente = cl.id_cliente
  `;

  db.query(querySQL, (err, results) => {
    if (err) {
      console.error('❌ Error al buscar carpetas:', err);
      return res.status(500).json({ error: 'Error del servidor al leer la bóveda' });
    }

    res.json({
      mensaje: "✅ ¡Bóveda Segura de MediCloud conectada!",
      tu_identidad: req.usuario,
      carpetas: results
    });
  });
});

// --- RUTA UTILIDAD: CREAR HASH (Solo para desarrollo) ---
app.get('/api/crear-hash/:clave', async (req, res) => {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(req.params.clave, salt);
  res.json({ clave_original: req.params.clave, hash_generado: hash });
});

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend ejecutándose en el puerto ${PORT}`);
});