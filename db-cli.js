const colors = require('colors');
const Prisma = require('@prisma/client');
const prisma = require('./config/prisma');

// admin@123
const adminPassword =
  '$2y$10$0dryq5Pj0yBFFb3c3GoTXeltpFXP8NyJjY3NDR4CQX6Gbu7E3gykG';

// 123456
const testPassword =
  '$2y$10$g1uK3U9fkeyq0G348s7PF.rvLDo/1mAzW08Pkl24a0GSfhsjyDMw6';

const init = async () => {
  try {
    switch (process.argv[2]) {
      case '--init':
        await prisma.user.createMany({
          data: [
            {
              id: 1,
              avatar: 'admin-default-1.jpg',
              name: 'Admin - 1',
              email: 'Muthu.Manjunathan@goltens.com',
              password: adminPassword,
              phone: '0000000001',
              department: 'Admin',
              employeeNumber: '1',
              type: Prisma.UserType.admin,
              adminApproved: Prisma.AdminApproved.approved
            },
            {
              id: 2,
              avatar: 'admin-default-2.jpg',
              name: 'Admin - 2',
              email: 'admin-2@mail.com',
              password: adminPassword,
              phone: '0000000002',
              department: 'Admin',
              type: Prisma.UserType.admin,
              employeeNumber: '2',
              adminApproved: Prisma.AdminApproved.approved
            },
            {
              id: 3,
              avatar: 'admin-default-3.jpg',
              name: 'Admin - 3',
              email: 'admin-3@mail.com',
              password: adminPassword,
              phone: '0000000003',
              department: 'Admin',
              employeeNumber: '3',
              type: Prisma.UserType.admin,
              adminApproved: Prisma.AdminApproved.approved
            }
          ]
        });

        console.log('Initialized!'.green);
        break;

      case '--seed':
        await prisma.user.createMany({
          data: [
            {
              id: 1,
              avatar: 'admin-default-1.jpg',
              name: 'Admin',
              email: 'admin@mail.com',
              password: testPassword,
              phone: '0000000000',
              department: 'Admin',
              type: Prisma.UserType.admin,
              employeeNumber: '1',
              adminApproved: Prisma.AdminApproved.approved
            },
            {
              id: 2,
              avatar: '',
              name: 'Test',
              email: 'test@mail.com',
              password: testPassword,
              phone: '1234567890',
              department: 'Testing',
              type: Prisma.UserType.user,
              employeeNumber: '2',
              adminApproved: Prisma.AdminApproved.approved
            },
            {
              id: 3,
              avatar: '',
              name: 'SubAdmin - 1',
              email: 'subadmin-1@mail.com',
              password: testPassword,
              phone: '1234567899',
              department: 'Marketing',
              type: Prisma.UserType.subAdmin,
              employeeNumber: '3',
              adminApproved: Prisma.AdminApproved.approved
            },
            {
              id: 4,
              avatar: '',
              name: 'SubAdmin - 2',
              email: 'subadmin-2@mail.com',
              password: testPassword,
              phone: '1234567699',
              department: 'Marketing',
              type: Prisma.UserType.subAdmin,
              employeeNumber: '4',
              adminApproved: Prisma.AdminApproved.approved
            },
            {
              id: 5,
              avatar: '',
              name: 'Sample',
              email: 'sample@mail.com',
              password: testPassword,
              phone: '8234567689',
              department: 'Development',
              type: Prisma.UserType.user,
              employeeNumber: '5',
              adminApproved: Prisma.AdminApproved.approved
            }
          ]
        });

        await prisma.group.create({
          data: {
            id: 1,
            name: 'Group 0',
            avatar: ''
          }
        });

        await prisma.member.createMany({
          data: [
            { groupId: 1, userId: 2 },
            { groupId: 1, userId: 3 },
            { groupId: 1, userId: 4 }
          ]
        });

        console.log('Seeded!'.green);
        break;

      case '--clean':
        await prisma.user.deleteMany();
        await prisma.group.deleteMany();
        await prisma.message.deleteMany();
        await prisma.riskAssessment.deleteMany();
        console.log('Cleaned!'.red);
        break;

      default:
        console.log('Unrecognized Command'.yellow);
        break;
    }
  } catch (err) {
    console.log(err);
  } finally {
    process.exit(0);
  }
};

init();
