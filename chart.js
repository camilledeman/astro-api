const swe = require('swisseph');

/**
 * Données de test (Béthune, France)
 * tz = décalage vs UTC (hiver FR = +1 ; été FR = +2)
 * UT = heure locale - tz
 */
const input = {
  year: 1990,
  month: 2,
  day: 10,
  hour: 3,
  minute: 30,
  lat: 50.53,
  lon: 2.64,
  tz: 1
};

// ---------- Utilitaires ----------
function localToUTDecimalHour(hour, minute, tz) {
  return (hour + minute / 60) - tz;
}

function norm360(x) {
  const v = x % 360;
  return v < 0 ? v + 360 : v;
}

function signFromLongitude(longitude) {
  const signs = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
  const lon = norm360(longitude);
  const signIndex = Math.floor(lon / 30);
  const degInSign = lon - signIndex * 30;
  return { sign: signs[signIndex], degrees: degInSign };
}

function calcJulDayUT(y, m, d, utHours) {
  return new Promise((resolve) => {
    swe.swe_julday(y, m, d, utHours, swe.SE_GREG_CAL, (jd) => resolve(jd));
  });
}

function calcPlanet(jdUT, planet) {
  return new Promise((resolve) => {
    swe.swe_calc_ut(jdUT, planet, swe.SEFLG_SPEED, (res) => resolve(res));
  });
}

/** Détermine la maison 1..12 à partir des cuspides renvoyées par swe_houses */
function houseFromCusps(lon, cusps12) {
  const L = norm360(lon);
  // cusps12 est un tableau de 12 longitudes (1→12)
  for (let i = 0; i < 12; i++) {
    const start = cusps12[i];
    const end = cusps12[(i + 1) % 12];
    // gérer l'enroulement 360°
    let s = start, e = end;
    if (e <= s) e += 360;
    let x = L;
    if (x < s) x += 360;
    if (x >= s && x < e) return i + 1; // maisons numérotées 1..12
  }
  return null;
}

// ---------- Programme principal ----------
(async () => {
  try {
    const ut = localToUTDecimalHour(input.hour, input.minute, input.tz);
    const jdUT = await calcJulDayUT(input.year, input.month, input.day, ut);

    // Planètes/points nécessaires
    const [sun, moon, jupiter, nodeTrue, pluto] = await Promise.all([
      calcPlanet(jdUT, swe.SE_SUN),
      calcPlanet(jdUT, swe.SE_MOON),
      calcPlanet(jdUT, swe.SE_JUPITER),
      calcPlanet(jdUT, swe.SE_TRUE_NODE),
      calcPlanet(jdUT, swe.SE_PLUTO),
    ]);

    // Maisons (Placidus = 'P') : renvoie { house: [12 cusps], ascendant, mc, ... }
    swe.swe_houses(jdUT, input.lat, input.lon, 'P', (res) => {
      if (!res || !Array.isArray(res.house)) {
        console.error("swe_houses n'a pas renvoyé 'house' :", res);
        return;
      }

      const cusps = res.house;          // 12 cuspides en degrés
      const asc = res.ascendant;        // Ascendant
      const mcLon = res.mc;             // Milieu du Ciel

      // Déterminer si c'est de jour (Soleil au-dessus de l'horizon = maisons 7..12)
      const sunHouse = houseFromCusps(sun.longitude, cusps);
      const isDay = sunHouse >= 7 && sunHouse <= 12;

      // Part of Fortune
      // Jour : PoF = ASC + Lune - Soleil
      // Nuit : PoF = ASC - Lune + Soleil
      const pofLon = isDay
        ? norm360(asc + moon.longitude - sun.longitude)
        : norm360(asc - moon.longitude + sun.longitude);

      // Maisons pour nos points
      const out = {
        jupiter: {
          longitude: jupiter.longitude,
          ...signFromLongitude(jupiter.longitude),
          house: houseFromCusps(jupiter.longitude, cusps)
        },
        northNode: {
          longitude: nodeTrue.longitude,
          ...signFromLongitude(nodeTrue.longitude),
          house: houseFromCusps(nodeTrue.longitude, cusps)
        },
        pluto: {
          longitude: pluto.longitude,
          ...signFromLongitude(pluto.longitude),
          house: houseFromCusps(pluto.longitude, cusps)
        },
        partOfFortune: {
          longitude: pofLon,
          ...signFromLongitude(pofLon),
          house: houseFromCusps(pofLon, cusps),
          sect: isDay ? "day" : "night"
        },
        mc: {
          longitude: mcLon,
          ...signFromLongitude(mcLon)
        }
      };

      console.log(JSON.stringify(out, null, 2));
    });

  } catch (e) {
    console.error("Erreur chart.js :", e);
  }
})();