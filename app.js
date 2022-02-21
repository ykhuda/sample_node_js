import dotenv from 'dotenv'
import express from 'express'
import path from 'path'
import logger from 'morgan'
import cors from 'cors'
import fileUpload from 'express-fileupload'
import swagger from 'swagger-ui-express'
import yaml from 'yamljs'
import useragent from 'express-useragent'
import pkg from './package.json'
import cookie from 'cookie-parser'

import APIRouter from './api/versions.js'
import dbObj from './db/models'
import constants from './helpers/constants/constants.js'
import startCronJobs from './jobs/cron.js'
import {handleErrorMw} from './middlewares/error.js'
import {isDevMode} from './helpers/utils/env.js'

dotenv.config()

// eslint-disable-next-line no-underscore-dangle
const swaggerAdminDoc = yaml.load('./swagger/build/admin.yaml')
const swaggerClientDoc = yaml.load('./swagger/build/client.yaml')
const __dirname = path.resolve()
const {
  userRuleHeaderName,
  OK,
  NOT_FOUND,
} = constants
const {version} = pkg
const db = dbObj.sequelize
const origin = ['https://main.amplifyapp.com', 'https://main.amplifyapp.com', 'https://Project_name.com', 'https://www.Project_name.com', 'https://Project_name.com', 'https://Project_name.com', 'http://Project_name.com', 'https://Project_name.com', 'https://Project_name.com', /http:\/\/localhost:[0-9]{1,4}/]
const app = express()

app.use(cookie())
app.use(express.static(path.join(__dirname, 'public')))
// ### CORS
app.use(cors({
  origin,
  // ### Expose
  // https://stackoverflow.com/questions/37897523/axios-get-access-to-response-header-fields
  exposedHeaders: userRuleHeaderName,
  credentials: true,
}))
app.options('*', cors({
  credentials: true,
  origin,
}))
app.use(useragent.express());
// ### AWS Connection Check
app.get('/healthCheck', (req, res) => res.status(OK).json({version}))
// ### File upload limit & configs
app.use(express.json({limit: '10mb'}))
app.use(express.urlencoded({extended: false, limit: '10mb'}))
app.use(fileUpload())
// ### DB sync
db.sync({
  // force: true, // --> Drop table if exist
  // alter: true, // --> Alter table if exist
  ...(isDevMode() ? {logging: false} : {}),
})
  .then(() => {
    console.log('\x1b[44m%s\x1b[0m', 'Connection has been established successfully.')
  })
  .catch((err) => {
    console.error('Unable to connect to the database:', err)
  })
// ### Session configs
app.set('trust proxy', 1)
app.use(logger('dev'))

// API
app.use('/api', APIRouter)

// ### keep-alive db connection
app.get('/connection', (req, res) => {
  res.writeHead(OK, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
  })
  const keepAlive = () => {
    res.write('data: keep connection alive\n\n')

    setTimeout(keepAlive, 60 * 1000)
  }

  keepAlive()
})

app.use('/api-admin', swagger.serveFiles(swaggerAdminDoc, {}), swagger.setup(swaggerAdminDoc));
app.use('/api-client', swagger.serveFiles(swaggerClientDoc, {}), swagger.setup(swaggerClientDoc));

app.get('/', (req, res) => {
  res.status(OK).json({message: `Home page. Version ${version}`})
})

app.get('*', (req, res) => {
  res.status(NOT_FOUND).json({message: 'Page not Found'})
})
// ### Error Handler
app.use((err, req, res, next) => handleErrorMw(err, res))
// ### Crons
startCronJobs()

export default app
