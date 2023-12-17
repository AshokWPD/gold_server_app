const colors = require('colors');
const app = require('./app');

const server = app.listen();

// ErrorHandler
process.on('unhandledRejection', reason => {
  console.log(`unhandledRejection ${reason}`.red);
  server.close(() => process.exit(1));
});


// const dotenv = require('dotenv');
// dotenv.config();

// const colors = require('colors');
// const app = require('./app');

// const PORT = process.env.PORT || 3000;

// const server = app.listen(PORT, () => {
//   console.log(`Express Server Running On Port -> ${PORT}`.yellow.underline);
// });

// // ErrorHandler
// process.on('unhandledRejection', reason => {
//   console.log(`unhandledRejection ${reason}`.red);
//   server.close(() => process.exit(1));
// });