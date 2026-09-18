import "dotenv/config";
import bcrypt from "bcryptjs";
import { Role } from "./types";
import { prisma } from "./db";

const DEMO_PASSWORD = "ChangeMe123!";

async function upsertUser(email: string, fullName: string, role: Role, extra: Record<string, string> = {}) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, fullName, role, passwordHash, ...extra },
  });
}

async function main() {
  const admin = await upsertUser("admin@caymantrade.example", "System Administrator", "ADMIN");
  const compliance = await upsertUser("compliance@caymantrade.example", "Compliance Officer", "COMPLIANCE_OFFICER");
  const dealer = await upsertUser("dealer@caymantrade.example", "Primary Dealer", "DEALER");
  const dealer2 = await upsertUser("dealer2@caymantrade.example", "Secondary Dealer", "DEALER");
  const client1 = await upsertUser("client1@caymantrade.example", "Alice Client", "CLIENT", {
    clientCode: "CLI-0001",
    jurisdiction: "Cayman Islands",
  });
  const client2 = await upsertUser("client2@caymantrade.example", "Bob Investor", "CLIENT", {
    clientCode: "CLI-0002",
    jurisdiction: "United Kingdom",
  });

  // eslint-disable-next-line no-console
  console.log("Seeded demo users (all use password:", DEMO_PASSWORD, ")");
  // eslint-disable-next-line no-console
  console.table(
    [admin, compliance, dealer, dealer2, client1, client2].map((u) => ({ email: u.email, role: u.role }))
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
