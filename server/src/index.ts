import 'dotenv/config';
import { app } from './app';
import { config } from './config';
import { prisma } from './prisma';
import { expireReservations } from './services/reservationService';

async function main() {
  await prisma.$connect();
  console.log('Connecté à PostgreSQL (gdtrading)');

  // Cas 3 : les reservations dont la date de fin est depassee sont annulees et le stock
  // rendu. Balayage au demarrage puis toutes les heures (independant des lectures, qui
  // declenchent aussi la purge).
  const sweep = async () => {
    try {
      const n = await expireReservations();
      if (n > 0) console.log(`Reservations expirees automatiquement : ${n}`);
    } catch (e) {
      console.error('Echec de la purge des reservations expirees', e);
    }
  };
  await sweep();
  const timer = setInterval(sweep, 60 * 60 * 1000);
  timer.unref();

  app.listen(config.port, () => {
    console.log(`API GD Trading V1 démarrée sur http://localhost:${config.port}/api`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
