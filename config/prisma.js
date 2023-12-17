const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
console.log("Prisma MYSQL Connected".cyan.underline);

module.exports = prisma;
