require('dotenv').config()
const fs = require('fs')
const path = require('path')

const rdsCa = fs.readFileSync(`${path.resolve()}/db/certs/rds-combined-ca-bundle.pem`)

const config = {
  development: {
    username: process.env.DEV_DB_USER,
    password: process.env.DEV_DB_PASS,
    database: process.env.DEV_DB_NAME,
    host: process.env.DEV_DB_HOST,
    dialect: 'mysql',
    define: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_general_ci',
    },
    dialectOptions: {
      dateStrings: true,
      typeCast: (field, next) => { // for reading from database
        if (field.type === 'DATETIME') {
          return field.string()
        }
        return next()
      },
      ssl: {
        ca: [rdsCa],
        minVersion: 'TLSv1',
      },
    },
    timezone: '+03:00',
    seederStorage: 'sequelize',
  }
}

module.exports = config;
