import { avanzaDrone } from './drone.js';

let timer;

async function passo(db) {
  const droni = await db.collection('droni').find().toArray();
  await Promise.all(droni.map(async (drone) => {
    const aggiornato = avanzaDrone(drone);
    await db.collection('droni').updateOne({ _id: drone._id }, { $set: aggiornato });
  }));
}

export function avviaAggiornamentoDroni(db) {
  if (timer) return;
  timer = setInterval(() => {
    passo(db).catch((errore) => {
      console.error(errore);
      if (errore.errInfo) console.error(JSON.stringify(errore.errInfo, null, 2));
    });
  }, 2000);
  timer.unref();
}
