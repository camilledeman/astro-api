const swe = require('swisseph');

// Exemple : calculer la position du Soleil le 10 février 1990 à 03h30 UTC
swe.swe_julday(1990, 2, 10, 3.5, swe.SE_GREG_CAL, (julday) => {
  swe.swe_calc_ut(julday, swe.SE_SUN, swe.SEFLG_SPEED, (result) => {
    if (result.error) {
      console.error("Erreur :", result.error);
    } else {
      console.log("Longitude du Soleil :", result.longitude);
    }
  });
});