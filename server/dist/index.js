"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const config_1 = require("./config");
const prisma_1 = require("./prisma");
const reservationService_1 = require("./services/reservationService");
async function main() {
    await prisma_1.prisma.$connect();
    console.log('Connecté à PostgreSQL (gdtrading)');
    // Cas 3 : les reservations dont la date de fin est depassee sont annulees et le stock
    // rendu. Balayage au demarrage puis toutes les heures (independant des lectures, qui
    // declenchent aussi la purge).
    const sweep = async () => {
        try {
            const n = await (0, reservationService_1.expireReservations)();
            if (n > 0)
                console.log(`Reservations expirees automatiquement : ${n}`);
        }
        catch (e) {
            console.error('Echec de la purge des reservations expirees', e);
        }
    };
    await sweep();
    const timer = setInterval(sweep, 60 * 60 * 1000);
    timer.unref();
    app_1.app.listen(config_1.config.port, () => {
        console.log(`API GD Trading V1 démarrée sur http://localhost:${config_1.config.port}/api`);
    });
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=index.js.map