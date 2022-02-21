import {promises as fs} from 'fs'
import Jimp from 'jimp'
import aws from '@aws-sdk/client-s3'
import s3 from '../configs/s3.config.js'
import {ErrorHandler} from './error.js'
import constants from '../helpers/constants/constants.js'
import {isDirExist} from '../helpers/utils/media/main.js'

const {PutObjectCommand} = aws
const {imgRegex, UNSUPPORTED_MEDIA} = constants

export default async (req, res, next) => {
  const {body: {changes}, body} = req
  const data = changes || body
  const {file} = data

  if (!file) return next()

  if (file && file.status === 'removed') {
    res.locals.imgDeleted = true
    return next()
  }

  const {name, thumbUrl, size} = file
  const tmp = './tmp'
  const base64Data = thumbUrl.replace(imgRegex, '')
  const key = `${Date.now()}_${name}`
  const filePath = `${tmp}/${key}`
  const dir = await isDirExist(tmp)

  // validation
  if (!name.match(/\.(jpg|JPG|jpeg|JPEG|png|PNG)$/)) {
    return next(new ErrorHandler(UNSUPPORTED_MEDIA, 'Method accespts only images [jpg|JPG|jpeg|JPEG|png|PNG]'))
  }

  if (size > 7340032) {
    return next(new ErrorHandler(UNSUPPORTED_MEDIA, 'File size limit in 7 mb exceeded.'))
  }

  if (!dir) await fs.mkdir(tmp)

  await fs.writeFile(filePath, base64Data, 'base64')
  const buffer = await fs.readFile(filePath)
  // create a file object to retriview dimentions
  const {bitmap: {width, height}} = new Jimp(filePath)

  const params = {
    Bucket: process.env.AWS_BUCKET,
    Body: buffer,
    Key: `${process.env.AWS_FOLDER_CARDIMAGE}/${key}`,
  }

  await Promise.all([
    s3.send(new PutObjectCommand(params)),
    fs.unlink(filePath),
  ])

  res.locals.filename = key
  res.locals.dimentions = {
    width,
    height,
  }

  return next()
};
