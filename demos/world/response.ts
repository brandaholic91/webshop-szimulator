// A world/src/world/response.py ket kepletenek TS-portja.
//
// A 27. dontes: ez a peek melletti MASODIK elo TS-matek. Azert megengedett,
// mert nem becsles — nincs illesztes, nincs optimalizalas, nincs konvergencia:
// egy zart alaku transzformacio kiertekelese, ugyanaz a muvelet, mint egy
// tengely skalazasa. Ami adatra ILLESZT, az Pythonban marad.
//
// Onellenorzes: a csuszkak alapallasa a vilag VALODI parametere, es a
// world_response.json tartalmazza a Python altal szamolt referencia-pontokat.
// Alapallasban az itt szamolt gorbenek ra kell fekudnie azokra a pontokra.

export function adstock(x: number[], decay: number): number[] {
  const out = new Array<number>(x.length);
  let carried = 0;
  for (let t = 0; t < x.length; t++) {
    carried = x[t] + decay * carried;
    out[t] = carried;
  }
  return out;
}

export function saturate(x: number, half: number, shape: number): number {
  if (x <= 0) return 0;
  const xa = Math.pow(x, shape);
  return xa / (xa + Math.pow(half, shape));
}

export function responseCurve(
  x: number[], decay: number, half: number, shape: number,
): number[] {
  return adstock(x, decay).map(v => saturate(v, half, shape));
}
