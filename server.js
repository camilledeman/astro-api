const express   = require('express');
const swe       = require('swisseph');
const app       = express();
const path      = require('path');
const swaggerUi = require('swagger-ui-express');
const fs        = require('fs');
const yaml      = require('yaml');

// pour lire le JSON reçu en POST
app.use(express.json());

// (facultatif) CORS si tu appelles l'API depuis le web
const cors = require('cors');
app.use(cors());

// page d'accueil -> redirige vers la doc
app.get('/', (_req, res) => {
  res.redirect('/docs');
});

// ---------- Utilitaires ----------
function norm360(x){ const v = x % 360; return v < 0 ? v + 360 : v; }
function signFromLongitude(longitude){
  const signs=["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
  const lon = norm360(longitude);
  const i   = Math.floor(lon/30);
  return { sign: signs[i], degrees: lon - i*30 };
}
function localToUTDecimalHour(h,m,tz){ return (h + m/60) - tz; }
function calcJulDayUT(y,m,d,ut){ return new Promise(r=>swe.swe_julday(y,m,d,ut,swe.SE_GREG_CAL,j=>r(j))); }
function calcPlanet(jd,pl){ return new Promise(r=>swe.swe_calc_ut(jd,pl,swe.SEFLG_SPEED,res=>r(res))); }
function houseFromCusps(lon,cusps){
  const L = norm360(lon);
  for(let i=0;i<12;i++){
    let s=cusps[i], e=cusps[(i+1)%12]; if(e<=s) e+=360;
    let x=L; if(x<s) x+=360; if(x>=s && x<e) return i+1;
  }
  return null;
}

// Health check
app.get('/health', (_req, res)=>res.send('ok'));

// ---- GET /chart (déjà fonctionnel) ----
app.get('/chart', async (req, res) => {
  try {
    const q = req.query;
    const need=['year','month','day','hour','minute','lat','lon','tz'];
    for(const k of need){ if(!(k in q)) return res.status(400).json({error:`Missing query param: ${k}`}); }

    const params = {
      year:   parseInt(q.year,10),
      month:  parseInt(q.month,10),
      day:    parseInt(q.day,10),
      hour:   parseFloat(q.hour),
      minute: parseFloat(q.minute),
      lat:    parseFloat(q.lat),
      lon:    parseFloat(q.lon),
      tz:     parseFloat(q.tz),
    };
    const out = await computeChart(params);
    res.json(out);
  } catch(e){ res.status(500).json({error: e.message||String(e)}); }
});

// Servir le fichier OpenAPI brut (YAML)
app.get('/openapi.yaml', (_req, res) => {
  res.sendFile(path.join(__dirname, 'openapi.yaml'));
});

// ---------- Swagger UI (une seule déclaration) ----------
const openapiYaml = fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8');
const openapiDoc  = yaml.parse(openapiYaml);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
// -------------------------------------------------------

// ---- POST /chart (nouvelle route) ----
// Body JSON attendu : { "year":1990, "month":2, "day":10, "hour":3, "minute":30, "lat":50.53, "lon":2.64, "tz":1 }
app.post('/chart', async (req, res) => {
  try {
    const b = req.body || {};
    const need=['year','month','day','hour','minute','lat','lon','tz'];
    for(const k of need){ if(!(k in b)) return res.status(400).json({error:`Missing body field: ${k}`}); }

    const params = {
      year:   parseInt(b.year,10),
      month:  parseInt(b.month,10),
      day:    parseInt(b.day,10),
      hour:   parseFloat(b.hour),
      minute: parseFloat(b.minute),
      lat:    parseFloat(b.lat),
      lon:    parseFloat(b.lon),
      tz:     parseFloat(b.tz),
    };
    const out = await computeChart(params);
    res.json(out);
  } catch(e){ res.status(500).json({error: e.message||String(e)}); }
});

// ---- Fonction de calcul commune ----
async function computeChart({year,month,day,hour,minute,lat,lon,tz}){
  const ut = localToUTDecimalHour(hour, minute, tz);
  const jd  = await calcJulDayUT(year, month, day, ut);

  const [sun, moon, jupiter, nodeTrue, pluto] = await Promise.all([
    calcPlanet(jd, swe.SE_SUN),
    calcPlanet(jd, swe.SE_MOON),
    calcPlanet(jd, swe.SE_JUPITER),
    calcPlanet(jd, swe.SE_TRUE_NODE),
    calcPlanet(jd, swe.SE_PLUTO),
  ]);

  return await new Promise((resolve, reject)=>{
    swe.swe_houses(jd, lat, lon, 'P', (h) => {
      if(!h || !Array.isArray(h.house)) return reject(new Error("swe_houses failed"));
      const cusps=h.house, asc=h.ascendant, mc=h.mc ?? (h.ascmc ? h.ascmc[1] : null);
      const sunHouse = houseFromCusps(sun.longitude, cusps), isDay = sunHouse>=7 && sunHouse<=12;
      const pofLon = isDay ? norm360(asc + moon.longitude - sun.longitude)
                           : norm360(asc - moon.longitude + sun.longitude);

      resolve({
        jupiter:       { longitude: jupiter.longitude,     ...signFromLongitude(jupiter.longitude),   house: houseFromCusps(jupiter.longitude, cusps) },
        northNode:     { longitude: nodeTrue.longitude,     ...signFromLongitude(nodeTrue.longitude), house: houseFromCusps(nodeTrue.longitude, cusps) },
        pluto:         { longitude: pluto.longitude,        ...signFromLongitude(pluto.longitude),    house: houseFromCusps(pluto.longitude, cusps) },
        partOfFortune: { longitude: pofLon,                 ...signFromLongitude(pofLon),              house: houseFromCusps(pofLon, cusps), sect: isDay ? "day" : "night" },
        mc:            { longitude: mc,                     ...signFromLongitude(mc) }
      });
    });
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`Server ready on http://localhost:${PORT}`));

