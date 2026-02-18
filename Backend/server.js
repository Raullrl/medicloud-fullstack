require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken'); 

const app = express();


app.use(cors());
app.use(express.json());

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

app.get('/api/estado', (req, res) => {
  db.query('SELECT nombre, apellidos FROM empleado LIMIT 3', (err, results) => {
    if (err) return res.status(500).json({ error: 'Error conectando a Aiven' });
    res.json({ mensaje: '✅ ¡Conexión exitosa a la nube de Aiven!', empleados: results });
  });
});

app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;

  if (!usuario || !password) {
    return res.status(400).json({ error: 'Faltan credenciales' });
  }

  db.query('SELECT * FROM usuario WHERE nombre_usuario = ?', [usuario], async (err, results) => {
    if (err) return res.status(500).json({ error: 'Error en el servidor' });

    if (results.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const userDB = results[0];

    if (userDB.estado === 'Bloqueado') {
      return res.status(403).json({ error: 'Tu cuenta ha sido bloqueada por seguridad.' });
    }

    const passwordValida = await bcrypt.compare(password, userDB.hash_contraseña);
    if (!passwordValida) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const token = jwt.sign(
      { id: userDB.id_usuario, rol: userDB.id_rol, nombre: userDB.nombre_usuario },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({
      mensaje: `¡Bienvenido a MediCloud, ${userDB.nombre_usuario}!`,
      token: token
    });
  });
});

const verificarToken = (req, res, next) => {
  const cabeceraAuth = req.headers['authorization'];
  const token = cabeceraAuth && cabeceraAuth.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '⛔ Acceso denegado. Necesitas iniciar sesión (Falta Token).' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, usuarioDecodificado) => {
    if (err) return res.status(403).json({ error: '⛔ Token inválido, caducado o manipulado.' });

    req.usuario = usuarioDecodificado;
    next();
  });
};

app.get('/api/carpetas', verificarToken, (req, res) => {
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

app.get('/api/crear-hash/:clave', async (req, res) => {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(req.params.clave, salt);
  res.json({ clave_original: req.params.clave, hash_generado: hash });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend ejecutándose en http://localhost:${PORT}`);
});