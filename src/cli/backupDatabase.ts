import { backupDatabase } from "../backup/DatabaseBackup.js";

const targetPath = process.argv[2];
const backupPath = await backupDatabase(targetPath);

console.log(`Database backup created at ${backupPath}.`);
console.log("WhatsApp auth/session state was not backed up.");
