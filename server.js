// ============================================================
//  MI DIARIO BÍBLICO — Backend completo con PostgreSQL
//  Stack: Node.js + Express + pg (node-postgres)
// ============================================================

const express = require('express');
const { Pool }  = require('pg');
const cors      = require('cors');
const path      = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Debug: mostrar si la URL está llegando ──
console.log('🔍 DATABASE_URL recibida:', process.env.DATABASE_URL ? 'SÍ está definida' : '❌ NO está definida');

// ── Conexión a PostgreSQL ──
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error al conectar con PostgreSQL:', err);
    console.error('   Verifica tu configuración de base de datos.');
  } else {
    console.log('✅ Conexión a PostgreSQL exitosa');
    release();
  }
});

// ── Inicializar base de datos ──
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lecturas (
        id              SERIAL PRIMARY KEY,
        titulo          VARCHAR(255)  NOT NULL,
        subtitulo       VARCHAR(255),
        libro           VARCHAR(100),
        versiculo_inicio VARCHAR(50),
        versiculo_fin    VARCHAR(50),
        versiculos_texto TEXT,
        fecha           DATE          NOT NULL,
        dios_me_dijo    TEXT,
        color_letra     VARCHAR(20)   NOT NULL DEFAULT '#f5f0e8',
        semana_grupo    VARCHAR(80),
        created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await pool.query(`
      DROP TRIGGER IF EXISTS trg_lecturas_updated_at ON lecturas;
      CREATE TRIGGER trg_lecturas_updated_at
        BEFORE UPDATE ON lecturas
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_lecturas_fecha        ON lecturas (fecha DESC);
      CREATE INDEX IF NOT EXISTS idx_lecturas_semana_grupo ON lecturas (semana_grupo);
    `);

    console.log('✅ Base de datos inicializada correctamente');
  } catch (err) {
    console.error('❌ Error al inicializar la base de datos:', err.message);
    process.exit(1);
  }
}

function handleError(res, err, msg = 'Error interno del servidor') {
  console.error(`[ERROR] ${msg}:`, err.message);
  res.status(500).json({ error: msg, detalle: err.message });
}

// ════════════════════════════════════════════════════════════
//  RUTAS DE LA API
// ════════════════════════════════════════════════════════════

app.get('/api/semanas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT semana_grupo, MIN(fecha) AS inicio, MAX(fecha) AS fin, COUNT(*) AS total_dias
      FROM lecturas
      WHERE semana_grupo IS NOT NULL AND semana_grupo <> ''
      GROUP BY semana_grupo
      ORDER BY MIN(fecha) DESC
    `);
    res.json(result.rows);
  } catch (err) {
    handleError(res, err, 'Error al obtener semanas');
  }
});

app.get('/api/lecturas', async (req, res) => {
  try {
    const { semana, libro } = req.query;
    const conditions = [];
    const params = [];
    if (semana) { params.push(semana); conditions.push(`semana_grupo = $${params.length}`); }
    if (libro)  { params.push(libro);  conditions.push(`libro = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const order = semana ? 'ORDER BY fecha ASC' : 'ORDER BY fecha DESC';
    const result = await pool.query(`SELECT * FROM lecturas ${where} ${order}`, params);
    res.json(result.rows);
  } catch (err) {
    handleError(res, err, 'Error al obtener lecturas');
  }
});

app.get('/api/lecturas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    const result = await pool.query('SELECT * FROM lecturas WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Lectura no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    handleError(res, err, 'Error al obtener la lectura');
  }
});

app.post('/api/lecturas', async (req, res) => {
  try {
    const { titulo, subtitulo=null, libro=null, versiculo_inicio=null, versiculo_fin=null,
            versiculos_texto=null, fecha, dios_me_dijo=null, color_letra='#f5f0e8', semana_grupo=null } = req.body;
    if (!titulo || titulo.trim() === '') return res.status(400).json({ error: 'El campo "titulo" es obligatorio' });
    if (!fecha) return res.status(400).json({ error: 'El campo "fecha" es obligatorio' });
    const result = await pool.query(
      `INSERT INTO lecturas (titulo,subtitulo,libro,versiculo_inicio,versiculo_fin,versiculos_texto,fecha,dios_me_dijo,color_letra,semana_grupo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [titulo.trim(), subtitulo||null, libro||null, versiculo_inicio||null, versiculo_fin||null,
       versiculos_texto||null, fecha, dios_me_dijo||null, color_letra, semana_grupo||null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    handleError(res, err, 'Error al crear la lectura');
  }
});

app.put('/api/lecturas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    const { titulo, subtitulo=null, libro=null, versiculo_inicio=null, versiculo_fin=null,
            versiculos_texto=null, fecha, dios_me_dijo=null, color_letra='#f5f0e8', semana_grupo=null } = req.body;
    if (!titulo || titulo.trim() === '') return res.status(400).json({ error: 'El campo "titulo" es obligatorio' });
    if (!fecha) return res.status(400).json({ error: 'El campo "fecha" es obligatorio' });
    const result = await pool.query(
      `UPDATE lecturas SET titulo=$1,subtitulo=$2,libro=$3,versiculo_inicio=$4,versiculo_fin=$5,
       versiculos_texto=$6,fecha=$7,dios_me_dijo=$8,color_letra=$9,semana_grupo=$10 WHERE id=$11 RETURNING *`,
      [titulo.trim(), subtitulo||null, libro||null, versiculo_inicio||null, versiculo_fin||null,
       versiculos_texto||null, fecha, dios_me_dijo||null, color_letra, semana_grupo||null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Lectura no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    handleError(res, err, 'Error al actualizar la lectura');
  }
});

app.delete('/api/lecturas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    const result = await pool.query('DELETE FROM lecturas WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Lectura no encontrada' });
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    handleError(res, err, 'Error al eliminar la lectura');
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) AS total_lecturas, COUNT(DISTINCT semana_grupo) AS total_semanas,
             COUNT(DISTINCT libro) AS total_libros, COUNT(DISTINCT fecha) AS total_dias,
             MIN(fecha) AS primera_lectura, MAX(fecha) AS ultima_lectura
      FROM lecturas
    `);
    const libros = await pool.query(`
      SELECT libro, COUNT(*) AS veces FROM lecturas
      WHERE libro IS NOT NULL AND libro <> ''
      GROUP BY libro ORDER BY veces DESC LIMIT 5
    `);
    res.json({ ...result.rows[0], libros_mas_leidos: libros.rows });
  } catch (err) {
    handleError(res, err, 'Error al obtener estadísticas');
  }
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'conectada', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'desconectada', error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── ARRANQUE ──
const PORT = process.env.PORT || 3000;

initDB().then(() => {
  app.listen(PORT, () => {
    console.log('🕊️  Mi Diario Bíblico — Servidor iniciado');
    console.log(`🚀  Puerto: ${PORT}`);
  });
});

process.on('SIGINT',  () => { pool.end(); process.exit(0); });
process.on('SIGTERM', () => { pool.end(); process.exit(0); });




