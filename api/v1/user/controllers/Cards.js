import Downloader from 'nodejs-file-downloader'
import aws from '@aws-sdk/client-s3'
import _lodash from 'lodash'
import pdf from 'html-pdf'
import jimp from "jimp"
import fs from 'fs'

import {
  findAvailableCards,
  findAvailableCardsSections,
  findCardById,
  getCard,
  getCustomCard,
  getFavoriteCard,
} from '../services/cards.service.js';
import {
  deleteEntity,
  findEntity,
  simpleCreateEntity,
  simpleUpdateEntity,
  transaction
} from '../../../../helpers/utils/model.utils.js';
import {
  getDiscountPercents,
  getSubscriptionDiscount,
  getUserGroupDiscount
} from './Users.js';
import {
  isCustom,
  isCustomized
} from '../../admin/controllers/Cards.js'
import {
  getFileNameByType,
  uploadFile
} from '../../../../helpers/utils/s3/upload.js'
import getHtml from "../../../../helpers/utils/cards/create-custom-card.helper.js"
import {isDirExist} from "../../../../helpers/utils/media/main.js"
import constants from '../../../../helpers/constants/constants.js'
import {Mapper} from '../../../../helpers/utils/cards/mapper.js'
import {getUrl} from '../../../../helpers/utils/media/getUrl.js'
import {ErrorHandler} from '../../../../middlewares/error.js'
import s3 from "../../../../configs/s3.config.js"
import {getList} from "./Categories.js";
import db from '../../../../db/models'


const {INVALID_DATA, SERVER_ERROR, IMAGE_ORIENTATION, OK, NO_PERMISSION, IMAGE_TYPE} = constants
const {AWS_FOLDER_CARDIMAGE, AWS_URL, AWS_BUCKET: bucket} = process.env
const {PutObjectCommand} = aws
const {Sequelize: {Op}} = db

const listCards = async (req) => {
  const {user, category, discount, isApp, query} = req;
  const {with_all_data = 1, page = 1, limit = 20, ...rest} = query;
  let {cards, count} = await findAvailableCards(user, isApp, category, page, +limit, !+with_all_data)
  cards = preparationCardsAllResponse(cards, discount, rest)

  return {
    page,
    total_items: count.length,
    total_pages: Math.ceil((count.length) / limit),
    cards,
  }
}

const listCustomUserImages = async (req, res, next) => {
  try {
    const {query: {type}, user} = req

    const images = await db.custom_user_images.findAll({
      where: {
        ...(type ? {type} : {}),
        user_id: user.id,
      },
      order: [['id', 'DESC']],
    })

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      images,
    })
  } catch (e) {
    next(e)
  }
}


const getRandomCards = async (limit, user, isApp) => {
  const cards = await db.card.findAll({
      where: {
        ...createCardCriterias(user, isApp),
        home_card: 1,
        quantity: {
          [Op.gt]: 0,
        },
      },
      include: [
        {
          model: db.category,
          through: {attributes: []},
          as: 'categories',

        },
      ],
      limit: limit,
      // ...(limit ? {limit} : []),
    },
  )
  return Promise.all(
    cards.map(
      async ({
               categories,
               cover,
               inside_image,
               available_free,
               totalImages,
               id,
               name,
               price,
               orientation,
               description,
               width,
               height,
             }) => {

        const cat = categories.length ? categories[0].name : null

        const images = await db.card_image.findAll({where: {card_id: id}, raw: true})
        return {
          id,
          name,
          cover: getUrl(cover),
          inside_image: getUrl(inside_image),
          price,
          category_name: cat,
          available_free: false,
          orientation,
          description,
          width,
          height,
          images: [Array.isArray(images) ? images.map(({image}) => getUrl(image)) : getUrl(images.image)],
        }
      }))

}

const getCardDetails = async (cardId, lowres, user, isApp) => {
  const [card] = await findAvailableCards(user, isApp, null, cardId)

  if (!card) throw new ErrorHandler(INVALID_DATA, 'No such card.')
}

const getView = async (cardId, lowres, user) => {
  const card = await getCard(cardId)

  if (!card) throw new ErrorHandler(INVALID_DATA, 'Card not found')

  const {discount, intervals} = await getDiscountPercents(user, 1)

  let discounts_table

  if (user && card.price > 0) {
    discounts_table = intervals.map(({min, max, value}) => {
      // if (min && min !== 0 && max && max !== 0 && value && value !== 0) {
      return {
        label: min,
        price: parseFloat(((100 - value) / 100) * card.price).toFixed(2),
        // }
      }
    })
  }
  const {category_id, cover, price, width, height, ...restCard} = card

  return {
    ...restCard,
    category_name: category_id ? card['category.name'] : null,
    cover: getUrl(cover),
    price: price,
    discount_price: discount === 0 ? null : parseFloat(((100 - discount) / 100) * price).toFixed(2),
    characters: width * height,
    discounts_table,
    images: await getCardImages(lowres, card),
  }
}

const getCardImages = async (lowres, card) => {
  const cardImages = await db.card_image.findAll({
    where: {card_id: card.id},
    order: [['sort_no', 'DESC']],
    raw: true,
  })

  let img = {}
  for (const image of cardImages) {
    const arr = []
    img[image.type] = [{
      image: lowres && image.image_lowres ? getUrl(image.image_lowres) : getUrl(image.image),
      width: image.image_width,
      height: image.image_height,
    }]
  }

  if (!img['front']) {
    img['front'] = [{
      image: lowres && card.cover_lowres ? getUrl(card.cover_lowres) : getUrl(card.cover),
      width: card.cover_width,
      height: card.cover_height,
    }]
  }

  return img
}

const discountIntervals = async (user) => {

  const initDiscountObj = {
    min: 0,
    max: 0,
    value: 0,
  }

  const intervals = await Promise.all([
    getSubscriptionDiscount(user, 1, initDiscountObj),
    getUserGroupDiscount(user, 1, initDiscountObj),
  ])

  const result = []
  let points = []

  for (const interval of intervals) {
    if (interval.min || interval.min === 0) {
      points.push(interval.min)
    }
    if (interval.max || interval.min === 0) {
      points.push(interval.max + 1)
    }
  }
  points = [...new Set(points)]

  const pool = []
  for (let i = 0; i < points.length; i++) {
    let maxK = null
    for (const interval of intervals) {
      if (interval.min <= points[i] && (interval.max >= points[i] || interval.max === 0) && (maxK === null || maxK < interval.value)) {
        maxK = interval.value
      }
    }
    if (maxK) {
      pool.push({
        min: points[i],
        max: points[i + 1] ? points[i + 1] - 1 : 0,
        value: maxK,
      })
    }
  }

  let k = 0
  for (let i = 0; i < pool.length; i++) {
    if (!result) {
      result.push({
        min: pool[i].min,
        max: pool[i].max,
        value: pool[i].value,
      })
      k += 1
    } else if (result[k - 1].value === pool[i].value) {
      result.unshift({
        min: pool[k - 1].min,
        max: pool[i].max,
        value: pool[i].value,
      })
    } else {
      result.push({
        min: pool[i].min,
        max: pool[i].max,
        value: pool[i].value,
      })
      k += 1
    }
  }

  if (result.length === 1 && result[0].max === 1 && result[0].min === 0) {
    return []
  }

  return result
}


const createCustomCard = async (req, res, next) => transaction(async (t) => {
  try {
    const {user, body: cardInfo} = req

    // const category = await db.category.findOne({where: {taxonomy: 'CUSTOM'}, raw: true})

    //card_orig
    const oldCard = await getCustomCard(cardInfo.card_id)

    if (oldCard.cover_restricted) cardInfo.cover_id = null;

    //original back
    let original_back;
    if (oldCard?.totalImages && (oldCard.taxonomy === 'CUSTOMIZED' || oldCard.isCustomize)) {
      original_back = oldCard.totalImages.find(i => i.type === 'back') || null
    }

    if (oldCard.taxonomy === 'CUSTOM') {
      original_back = oldCard?.custom_card_info?.original_back
      // if (!original_back) {
      //   original_back = oldCard.half_inside
      // }
    }

    cardInfo.original_back = original_back;

    const isValid = await validate(cardInfo, user);


    if (!isCustom(oldCard.category) && !isCustomized(oldCard.category)) {
      throw new ErrorHandler(INVALID_DATA, 'Customized card is not found')
    }

    if (!cardInfo.name) throw new ErrorHandler(INVALID_DATA, 'card name not set');
    const {
      status,
      price,
      description,
      width,
      height,
      available_free,
      sort_no,
      orientation,
      sku,
      closed_height,
      closed_width,
      open_height,
      open_width,
      cover_restricted,
      margin_top,
      margin_right,
      margin_bottom,
      margin_left,
      envelope_height,
      envelope_width,
      envelope_margin_top,
      envelope_margin_right,
      envelope_margin_bottom,
      envelope_margin_left,
      preview_margin_left,
      preview_margin_top,
      preview_margin_right,
      preview_margin_bottom,
      cover: old_cover,
      cover_lowres: old_cover_lowres,
      cover_width: old_cover_width,
      cover_height: old_cover_height,
    } = oldCard

    const {
      name,
      header_text,
      header_align,
      header_font_size,
      header_font_id,
      header_font_color,
      footer_font_size,
      footer_text,
      footer_font_id,
      footer_align,
      footer_auto_size,
      footer_font_color,
      logo_id,
      footer_logo_id,
      cover_id,
      cover_size_percent = 100,
      logo_size_percent = 100,
      footer_logo_size_percent = 100,
    } = cardInfo

    // TODO create inside;
    const [{image_height, image_width, image}, {
      cover,
      cover_lowres,
      cover_width,
      cover_height,
    }] = await Promise.all([
      createLogoPdf(cardInfo, oldCard),
      saveCoverImage(cardInfo, oldCard)
    ])

    const newCard = await simpleCreateEntity('card', {
      status,
      category_id: 27,
      user_id: user.id,
      quantity: 9999,
      price,
      description,
      width,
      height,
      available_free,
      sort_no,
      orientation,
      sku,
      closed_height,
      cover_restricted,
      closed_width,
      open_height,
      open_width,
      margin_top,
      margin_right,
      margin_bottom,
      margin_left,
      envelope_height,
      envelope_width,
      envelope_margin_top,
      envelope_margin_right,
      envelope_margin_bottom,
      envelope_margin_left,
      preview_margin_left,
      preview_margin_top,
      preview_margin_right,
      preview_margin_bottom,
      half_inside: image,
      cover: !oldCard.cover_restricted ? cover : old_cover,
      cover_lowres: !oldCard.cover_restricted ? cover_lowres : old_cover_lowres,
      cover_width: cover_id ? cover_width : old_cover_width,
      cover_height: cover_id ? cover_height : old_cover_height,
      name,
    }, t)
    //header custom logo

    await Promise.all([
      simpleCreateEntity('card_image', {
        card_id: newCard.id,
        image: !oldCard.cover_restricted ? cover : old_cover,
        image_lowres: !oldCard.cover_restricted ? cover_lowres : old_cover_lowres,
        image_width: cover_id ? cover_width : old_cover_width,
        image_height: cover_id ? cover_height : old_cover_height,
        type: 'front',
        sort_no: 0,
      }, t),
      simpleCreateEntity('card_image', {
        card_id: newCard.id,
        image: image,
        image_lowres: image,
        image_width: image_width,
        image_height: image_height,
        type: oldCard.orientation === IMAGE_ORIENTATION.FLAT ? 'inside' : 'back',
        sort_no: 0,
      }, t)
    ]);

    let header_logo
    if (logo_id) {
      header_logo = await findEntity('custom_user_images', null, {
        id: logo_id,
        type: 'logo',
        user_id: user.id,
      }, null, {
        raw: true,
        nest: true,
      }, null)
      if (!header_logo) {
        throw new ErrorHandler(INVALID_DATA, 'Header logo id not valid!')
      }
    }

    //footer custom logo
    let footer_logo
    if (footer_logo_id) {
      footer_logo = await findEntity('custom_user_images', null, {
        id: footer_logo_id,
        type: 'logo',
        user_id: user.id,
      }, null, {
        raw: true,
        nest: true,
      }, null)
      if (!footer_logo) {
        throw new ErrorHandler(INVALID_DATA, 'Footer logo id not valid!')
      }
    }

    const [fHeader, fFooter] = await Promise.all([
      findEntity('custom_card_fonts', header_font_id, null, null, {raw: true, nest: true}, null),
      findEntity('custom_card_fonts', footer_font_id, null, null, {raw: true, nest: true}, null)])

    if (!fFooter || !fHeader) throw new ErrorHandler(INVALID_DATA, 'font not found')
    //create custom card info
    const custom_card_info = await simpleCreateEntity('custom_card_info', {
      card_id: newCard.id,
      ...(cover ? {cover_id: cover_id} : {}),
      cover_size_percent,
      header_font_id: header_font_id || 1,
      footer_font_id: footer_font_id || 1,
      ...((cardInfo.type === 'logo') ? {
        logo_id: header_logo.id,
        logo_size_percent,
        header_text: '',
        header_align,
        header_font_size: '',
      } : {}),
      ...((cardInfo.type === 'text') ? {
        header_text,
        header_align,
        header_font_size,
        header_font_color,
      } : {}),
      // ...((!header_logo && !header_text) ? {
      //   header_text: '',
      //   header_align: '',
      //   header_font_size: '',
      //   header_font_color: '',
      // } : {}),
      ...((cardInfo.footerType === 'logo') ? {
        footer_logo_id: footer_logo.id,
        footer_logo_size_percent,
        footer_text: '',
        footer_align,
        footer_font_size: '',
      } : {}),
      ...((cardInfo.footerType === 'text') ? {
        footer_text,
        footer_align,
        footer_font_size,
        footer_font_color,
      } : {}),
      // ...((!footer_logo && !footer_text) ? {
      //   footer_text: '',
      //   footer_align: '',
      //   footer_font_size: '',
      //   footer_font_color: '',
      // } : {}),
    }, t)


    if (isCustomized(oldCard.category)) {
      if (oldCard && oldCard.image)
        await simpleUpdateEntity('custom_card_info', {id: custom_card_info.id}, {original_back: oldCard?.image || null}, t)
    }
    if (isCustom(oldCard.category)) {
      await simpleUpdateEntity('custom_card_info', {id: custom_card_info.id}, {original_back: oldCard?.custom_card_info?.original_back}, t)
    }

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      card_id: newCard.id,
    })
  } catch (e) {
    next(e)
  }
})


const validate = async (object, user) => {
  if (!object.name) {
    return false
  }

  if (object.type === 'logo') {
    if (object.logo_id) {
      return false
    }

    const customUserImage = await db.custom_user_images.findByPk(object.logo_id)

    if (!customUserImage && customUserImage.user_id !== user.id) {
      return false
    }

    object.logo = customUserImage.image_url

  }
  if (object.footer_logo_id) {
    const customUserImage = await db.custom_user_images.findByPk(object.footer_logo_id)
    if (!customUserImage || customUserImage.user_id !== user.id) {
      return false
    }
    object.footerLogo = customUserImage.image_url
  }

  if (object.cover_id) {
    const customUserImage = await db.custom_user_images.findByPk(object.cover_id)
    if (!customUserImage, customUserImage.user_id !== user.id || customUserImage.type !== 'cover') {
      return false
    }
  }

  object.header_font = ''
  object.footer_font = ''

  const fontH = await db.custom_card_fonts.findByPk(object.header_font_id)
  if (fontH) {
    object.header_font = fontH.label
  }

  const fontF = await db.custom_card_fonts.findByPk(object.footer_font_id)
  if (fontF) {
    object.footer_font = fontF.label
  }

  return true
}

const createLogoPdf = async (object, oldCard) => {
  if (!object.logo_size_percent) {
    object.logo_size_percent = 100
  }
  if (!object.footer_logo_size_percent) {
    object.footer_logo_size_percent = 100
  }

  const logoSize = 0.75 * 96 * object.logo_size_percent / 100;
  let logoContainerSize = logoSize;

  if (object.logo_size_percent > 100) {
    logoContainerSize = 0.75 * 96;
  }
  // closed_width and closed_height is in inch
  // inch to px = 1 inch = 96px
  const w = _lodash.round(oldCard.closed_width * 96)
  const h = _lodash.round(oldCard.closed_height * 96)

  const {fontF, fontH} = await downloadFonts(object);

  const htmlLayout = getHtml(object, oldCard, getExtendFontName(fontH), getExtendFontName(fontF));

  const back_image_path = `customCards/${new Date().getTime()}.png`;

  const options = {
    height: `${h + 12}px`,        // allowed units: mm, cm, in, px
    width: `${w}px`,
    orientation: 'landscape',
    type: "png",
    timeout: 30000
  };

  await pdf.create(htmlLayout, options).toBuffer(async (err, buffer) => {
    if (err) throw new ErrorHandler(INVALID_DATA, err);


    const lowerParams = {
      Bucket: bucket,
      Body: buffer,
      Key: `${AWS_FOLDER_CARDIMAGE}/${back_image_path}`,
      ContentType: 'image/png',
    }
    await s3.send(new PutObjectCommand(lowerParams));
  });

  return {
    image: back_image_path,
    image_width: 2265,
    image_height: 1570,
  }
}
const getExtendFontName = (font) => {
  if (!font) {
    return null;
  }

  return `${AWS_URL}/${font.font_file}`;
}
const saveCoverImage = async (cardInfo, cardOrig) => {
  const path = `customCards/${new Date().getTime()}_cover.jpg`;
  const lowerPath = `customCards/${new Date().getTime()}_lower.jpg`;

  const tmp = './tmp/customCard'
  const localPath = `${tmp}/image.png`
  const localLowerPath = `${tmp}/image-lower.png`
  const originalCard = `${tmp}/card.jpg`

  if (!(await isDirExist(tmp))) {
    await fs.mkdir(tmp, err => {
      if (err) throw new ErrorHandler(INVALID_DATA, err)
    })
  }

  let toWidth;
  let toHeight;
  const cropData = {};

  const uploadList = [];

  let imageUrl = ''

  if (cardInfo.cover_id) {
    const cuImage = await db.custom_user_images.findOne({
      where: {
        id: cardInfo.cover_id,
        type: 'cover',
      },
    })

    if (!cuImage) return;
    imageUrl = cuImage.image_url;
  } else {
    imageUrl = getUrl(cardOrig.cover);
  }

  const image = await jimp.read(imageUrl);
  await image.writeAsync(originalCard)

  const {bitmap: {width, height}} = image;
  if (!width || !height) throw new ErrorHandler(INVALID_DATA, 'Invalid cover image!')

  const imageRatio = width / height;

  if (!cardOrig.cover_restricted) {
    const dpi = 200;
    const coverSizePercent = cardInfo.cover_size_percent;

    const bleedRatio = (cardOrig.closed_width - 0.25) / (cardOrig.closed_height - 0.25);
    const bleedWidth = (cardOrig.closed_width - 0.25) * dpi;
    const bleedHeight = (cardOrig.closed_height - 0.25) * dpi;

    if (imageRatio >= bleedRatio) {
      toWidth = _lodash.round(coverSizePercent / 100 * bleedWidth);
      toHeight = _lodash.round(toWidth / imageRatio);
    } else {
      toHeight = _lodash.round(coverSizePercent / 100 * bleedHeight);
      toWidth = _lodash.round(toHeight * imageRatio);
    }

    const d = toHeight / height;
    if (coverSizePercent === 100) {
      await image.writeAsync(localPath);

    } else if (coverSizePercent > 100) {
      cropData.x = _lodash.round((toWidth - bleedWidth) / 2 / d);
      cropData.y = _lodash.round((toHeight - bleedHeight) / 2 / d);
      cropData.width = _lodash.round(bleedWidth / d);
      cropData.height = _lodash.round(bleedHeight / d);

      await image
        .crop(cropData.x, cropData.y, cropData.width, cropData.height)
        .resize(bleedWidth, bleedHeight)

      if (+cardOrig.closed_width !== 7 && +cardOrig.closed_height !== 5) {
        cropData.x = _lodash.round(0.125 * dpi);
        cropData.y = _lodash.round(0.125 * dpi);
        cropData.width = cardOrig.closed_width * dpi;
        cropData.height = cardOrig.closed_height * dpi;

        await image.crop(cropData.x, cropData.y, cropData.width, cropData.height)
      }
      await image.writeAsync(localPath)


    } else {
      // coverSizePercent < 100
      await image.resize(toWidth, toHeight);

      let maxWidth = cardOrig.closed_width * dpi
      let maxHeight = cardOrig.closed_height * dpi

      if (+cardOrig.closed_width === 7 && +cardOrig.closed_height === 5) {
        maxWidth = (cardOrig.closed_width - 0.25) * dpi
        maxHeight = (cardOrig.closed_height - 0.25) * dpi
      }

      cropData.x = (maxWidth - toWidth) / 2;
      cropData.y = (maxHeight - toHeight) / 2;
      cropData.width = maxWidth;
      cropData.height = maxHeight;


      let whiteImage = new jimp(maxWidth, maxHeight, 'white');
      const {bitmap: {width, height}} = image;

      whiteImage.composite(image, (maxWidth - width) / 2, (maxHeight - height) / 2)

      await whiteImage.writeAsync(localPath)
    }
  } else {
    await image.writeAsync(localPath);
  }

  const imageToUpload = await fs.readFileSync(localPath)
  const params = {
    Bucket: bucket,
    Body: imageToUpload,
    Key: `${AWS_FOLDER_CARDIMAGE}/${path}`,
    ContentType: 'image/png',
  }

  uploadList.push(s3.send(new PutObjectCommand(params)));

  // create lowres cover
  await image.resize(width >> 2, height >> 2)
  await image.writeAsync(localLowerPath)

  const lowerToUpload = await fs.readFileSync(localLowerPath)
  const lowerParams = {
    Bucket: bucket,
    Body: lowerToUpload,
    Key: `${AWS_FOLDER_CARDIMAGE}/${lowerPath}`,
    ContentType: 'image/png',
  }

  uploadList.push(s3.send(new PutObjectCommand(lowerParams)));

  await Promise.all(uploadList)

  return {
    cover: path,
    cover_lowres: lowerPath,
    cover_width: width,
    cover_height: height,
  }
}

const downloadFonts = async (object) => {//Wrapping the code with an async function, just for the sake of example.
  try {
    let fontH = ''
    let fontF = ''
    let fontFileHeader = '';
    let fontFileFooter = '';
    let sameFont = false;

    if ((object.type === 'text' && object.header_font_id) && (object.footerType === 'text' && object.footer_font_id) && (object.header_font_id === object.footer_font_id)) {
      sameFont = true
    }

    if (!sameFont && object.type === 'text' && object.header_font_id) {
      fontH = await db.custom_card_fonts.findByPk(object.header_font_id)
      fontFileHeader = getExtendFontName(fontH)
    }

    if (!sameFont && object.footerType === 'text' && object.footer_font_id) {
      fontF = await db.custom_card_fonts.findByPk(object.footer_font_id)
      fontFileFooter = getExtendFontName(fontF);
    }

    if (sameFont) {
      fontH = await db.custom_card_fonts.findByPk(object.header_font_id)
      fontF = fontH;
      fontFileHeader = getExtendFontName(fontH)
      fontFileFooter = getExtendFontName(fontF)
    }

    if (sameFont && fontFileHeader && fontFileFooter) {
      const downloaderFont = new Downloader({
        url: fontFileHeader,//If the file name already exists, a new file with the name 200MB1.zip is created.
        directory: "./tmp/customCard",//This folder will be created, if it doesn't exist.
        fileName: `${fontH.name}.ttf`,
      })
      await downloaderFont.download();//Downloader.download() returns a promise.
    }
    if (!sameFont && fontFileHeader) {
      const downloaderHeaderFont = new Downloader({
        url: fontFileHeader,//If the file name already exists, a new file with the name 200MB1.zip is created.
        directory: "./tmp/customCard",//This folder will be created, if it doesn't exist.
        fileName: `${fontH.name}.ttf`,
      })
      await downloaderHeaderFont.download();//Downloader.download() returns a promise.
    }
    if (!sameFont && fontFileFooter) {
      const downloaderFooterFont = new Downloader({
        url: fontFileFooter,//If the file name already exists, a new file with the name 200MB1.zip is created.
        directory: "./tmp/customCard",//This folder will be created, if it doesn't exist.
        fileName: `${fontF.name}.ttf`,
      })
      await downloaderFooterFont.download();//Downloader.download() returns a promise.
    }

    return {fontH, fontF}
  } catch (error) {//IMPORTANT: Handle a possible error. An error is thrown in case of network errors, or status codes of 400 and above.
    throw new ErrorHandler(SERVER_ERROR, error)
    //Note that if the maxAttempts is set to higher than 1, the error is thrown only if all attempts fail.
  }
}

const uploadCustomLogo = async (req, res, next) => {
  try {
    const {user, type, file} = req

    validateTypeAndFile(type, file)

    const imagePath = getFileNameByType(file, type, 'customCards')

    const [customImage] = await Promise.all([
      db.custom_user_images.create({
        user_id: user.id,
        image: imagePath,
        thumbnail_url: '',
        image_url: getUrl(imagePath, AWS_FOLDER_CARDIMAGE),
        type
      }),
      await uploadFile(file, imagePath, AWS_FOLDER_CARDIMAGE)])

    const {image_url, id} = customImage

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      id,
      image_url,
    })
  } catch (e) {
    next(e)
  }
}

const validateTypeAndFile = (type, file) => {
  if (!type || !['logo', 'cover'].includes(type)) throw new ErrorHandler(INVALID_DATA, 'Type error.')
  if (!file) throw new ErrorHandler(INVALID_DATA, 'File not found. Send in multipart/form-data.')
}

const changeFavoriteCards = async (card_id, userId) => {
  if (!card_id) throw new ErrorHandler(INVALID_DATA, 'card id error')

  const card = await findCardById(card_id, userId)

  const {isFavorite} = card

  if (isFavorite) {
    await db.user_favorite_cards.destroy({
      where: {
        user_id: userId,
        card_id,
      },
    })
  }
  if (!isFavorite) {
    await simpleCreateEntity('user_favorite_cards', {user_id: userId, card_id, date: new Date()})
  }
  return {
    favorite_card: !isFavorite ? card : null,
    is_like: !isFavorite,
    card_id,
  }
}

const favoriteList = async (user_id, query = {}, discount = 0) => {
  const {with_images, with_detailed_images, lowres, with_all_data = 0, page = 1, limit = 20} = query

  const {count, rows: favoriteCard} = await getFavoriteCard(user_id, with_all_data, +page, +limit)

  if (!count) {
    return {count, rows: favoriteCard}
  }

  if (!+with_all_data) {
    return {
      rows: favoriteCard.map(({card}) => card.id),
      count,
    }
  }

  const favorite = []

  for (const item of favoriteCard) {
    const {
      id,
      cover,
      half_inside,
      cover_lowres,
      price,
      category,
      ...rest
    } = item.card

    const images = await db.card_image.findAll({where: {card_id: id}, raw: true})
    let img = {}
    if (images.length && with_detailed_images) {
      images.map((image) => {
          return img[image.type] = {...image, image: getUrl(image.image), image_lowres: getUrl(image.image_lowres)}
        },
      )
    }
    favorite.push({
      id,
      cover: lowres && cover_lowres ? getUrl(cover_lowres) : getUrl(cover),
      isFavorite: 1,
      price,
      discount_price: discount === 0 ? null : parseFloat(((100 - discount) / 100) * price).toFixed(2),
      inside_image: getUrl(half_inside),
      category_id: category ? category.id : null,
      category_name: category ? category.name : null,
      category_taxonomy: category ? category.taxonomy : null,
      ...rest,
      ...(with_images ? {
        images: images.length && images.map(({image}) => getUrl(image)),
      } : {}),
      isCustom: category && category.taxonomy === 'CUSTOM' ? 1 : 0,
      isCustomize: category && category.taxonomy === 'CUSTOMIZED' ? 1 : 0,
      detailed_images: with_detailed_images ? img : null,
    })
  }
  return {count, rows: favorite}
}

const listCardsSections = async (req) => {
  let {user, isApp, discount, query, category: all_category} = req;
  let {page = 1, limit = 3, ...rest} = query;

  if (all_category.length === 0) {
    return {
      cards: [],
      total_pages: 0,
    }
  }

  const category = spliceArray(+page, +limit, all_category)

  if (category.length === 0) {
    return {
      cards: [],
      total_pages: Math.ceil((all_category.length) / limit),
    }
  }

  const {cards} = await findAvailableCardsSections(user, isApp, category)
  const response = preparationCardsAllResponse(cards, discount, rest)

  return {
    total_pages: Math.ceil((all_category.length) / limit),
    cards: response,
    discount: discount ? discount : 0,
  }
}

const spliceArray = (page, limit, arr) => {
  let start = (page - 1) * limit
  const end = start + limit
  return arr.slice(start, end)
}


const preparationCardsAllResponse = (cards,
                                     discount = 0,
                                     {with_detailed_images, with_images, lowres}) => cards.map((
  {
    category,
    custom_card_meta,
    custom_card_infos,
    totalImages,
    cover_lowres,
    half_inside,
    cover,
    price,
    width,
    height,
    font_size,
    preview_margin_top,
    preview_margin_bottom,
    preview_margin_left,
    preview_margin_right,
    ...card
  }) => {
  const is_inside = custom_card_meta && custom_card_meta.length && custom_card_meta[0].products && custom_card_meta[0].products[0].active

  let img = {}
  if (totalImages?.length && with_detailed_images) {
    totalImages.map((image) => {
        return img[image.type] = {...image, image: getUrl(image.image), image_lowres: getUrl(image.image_lowres)}
      },
    )
  }
  return {
    ...card,
    price,
    cover: lowres && cover_lowres ? getUrl(cover_lowres) : getUrl(cover),
    inside_image: getUrl(half_inside),
    discount_price: discount === 0 ? null : parseFloat(((100 - discount) / 100) * price).toFixed(2),
    category_id: category ? category.id : null,
    category_name: category ? category.name : null,
    category_taxonomy: category ? category.taxonomy : null,
    characters: width * height,
    font_size: font_size || 32,
    margin_top: preview_margin_top,
    margin_bottom: preview_margin_bottom,
    margin_left: preview_margin_left,
    margin_right: preview_margin_right,
    customCardInfo: custom_card_infos,
    ...(discount ? {
      price_orig: price,
    } : {}),
    ...(category && category.taxonomy === 'CUSTOMIZED' && custom_card_meta ? {
      is_inside: is_inside && Boolean(half_inside),
      has_meta: true,
    } : {}),
    ...(with_images ? {
      images: totalImages.length && totalImages.map(({image}) => getUrl(image)),
    } : {}),
    detailed_images: with_detailed_images ? img : null,
    ...(custom_card_meta && custom_card_meta.products ? {has_meta: true} : {}),
  }
})


const list = async (req, res, next) => {
  try {
    const {user, category, discount, query} = req;
    const promises = [];

    promises.push(listCards(req, res, user, category, discount))

    if (user && category.includes(0)) {
      promises.push(favoriteList(user.id, {...query, with_all_data: 1}, discount))
    }

    const [{cards, total_pages, page, total_items}, favorite] = await Promise.all(promises)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      ...(favorite && favorite.count ? {
        page: +query.page,
        total_items: favorite.count,
        total_pages: Math.ceil((favorite.count) / req.query.limit || 20),
      } : {
        total_items,
        total_pages,
        page,
      }),
      cards: [...cards, ...(favorite ? favorite.rows : [])],
    })
  } catch (e) {
    next(e);
  }
}


const section = async (req, res, next) => {
  try {
    const {user, category, discount, query: {page}} = req;
    const {locals: {platform}} = res;
    let with_all_data;

    const promises = [];

    const mapper = new Mapper();

    if (_lodash.isEmpty(category)) {
      req.category = await getList(user, platform, 1);
    }

    promises.push(listCardsSections(req));

    if (user && (+page === 1 || !page)) {
      with_all_data = 1;
      promises.push(favoriteList(user.id, {with_all_data, ...req.query}, discount));
    } else if (user) {
      with_all_data = 0;
      promises.push(favoriteList(user.id, {with_all_data, ...req.query}));
    }

    let [{cards, total_pages}, {rows: favorite} = {favorite: []}] = await Promise.all(promises);

    const cardsWithSections = mapper.cardsToSections(cards)._toArray() || [];

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      total_pages,
      page,
      ...(!user && req.page === 1 ? {cards: cardsWithSections} : {
        cards: [
          ...(favorite?.length > 0 && with_all_data ? [{
            id: 0,
            key: 'Favorites',
            value: favorite,
          }] : []), ...cardsWithSections],
      }),
    });
  } catch (e) {
    next(e)
  }
}


const view = async (req, res, next) => {
  try {

    let {user, query: {card_id, lowres = 0}} = req
    if (!card_id) throw new ErrorHandler(INVALID_DATA, 'card id error')

    if (lowres) {
      lowres = 1
    }

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      card: await getView(card_id, lowres, user),
    })
  } catch (e) {
    next(e)
  }
}

const random = async (req, res, next) => {
  try {
    const {query: {card_number}, user} = req
    const {locals: {platform}} = res
    const isApp = platform === 'iOS/App' || platform === 'Android/App'

    const cards = await getRandomCards(card_number, user, isApp)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      cards,
    })
  } catch (e) {
    next(e)
  }
}


const checkUploadedCustomLogo = async (req, res, next) => {
  try {
    const {user, body: {image_id}} = req

    if (!image_id) {
      throw new ErrorHandler(NO_PERMISSION, 'File source not found')
    }

    const image = await findEntity('custom_user_images', image_id)

    if (!image || image.user_id !== user.id) {
      throw new ErrorHandler(NO_PERMISSION, 'Access denied')
    }

    const mimeType = image.image_url.split('.').pop()

    if (!IMAGE_TYPE.some((value) => value === mimeType)) throw new ErrorHandler(NO_PERMISSION, 'The file is not an image')

    const newFileJimp = await jimp.read(image.image_url)
    const {bitmap: {width, height}} = newFileJimp

    let warning = null
    let error = null

    switch (image.type) {
      case 'cover':
        if (width < 2025 || height < 1425) {
          warning = 'This image may appear blurry as it is less than the recommended resolution.'
        }
        break
      case 'logo':
        if (height < 225) {
          error = 'This image is less than recommended resolution. Please upload another image.'
        }
        break
      default:
        return
    }

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      warning,
      error,
    })
  } catch (e) {
    next(e)
  }
}


const deleteCustomLogo = async (req, res, next) => {
  try {
    const {image_id} = req.body

    if (!image_id) throw new ErrorHandler(INVALID_DATA, 'Image id is not set.')

    await deleteEntity('custom_user_images', {id: image_id})

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
    })
  } catch (e) {
    next(e)
  }
};

const deleteCustomCard = (req, res, next) => transaction(async (t) => {
  try {
    const {query: {card_id, category_id}, user} = req
    if (!card_id) throw new ErrorHandler(INVALID_DATA, 'Card id is not set.')

    await Promise.all([
      deleteEntity('card', {id: card_id, user_id: user.id}, t),
      deleteEntity('user_favorite_cards', {card_id, user_id: user.id}, t),
      deleteEntity('custom_card_info', {card_id}, t),
      deleteEntity('card_image', {card_id}, t),
    ])

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      category_id: +category_id,
    })
  } catch (e) {
    next(e)
  }
})


const updateFavoriteCard = async (req, res, next) => {
  try {
    const {user, body: {card_id: id}, query} = req

    const promises = []
    const {favorite_card, card_id, is_like} = await changeFavoriteCards(+id, user.id)

    promises.push(favoriteList(user.id, query))

    if (is_like) {
      promises.push(getCardImages(false, favorite_card))
    }

    const [{rows: favorite_cards}, image] = await Promise.all(promises)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      favorite_card: is_like ? {
        ...favorite_card,
        cover: getUrl(favorite_card.cover),
        half_inside: getUrl(favorite_card.half_inside),
        detailed_images: image
      } : null,
      favorite_cards,
      card_id,
      is_like
    })
  } catch (e) {
    next(e)
  }
}


const userFavoritesCards = async (req, res, next) => {
  try {
    const {user, query} = req;

    const {rows: favorite} = await favoriteList(user.id, query);

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      favorite_cards: favorite,
    })
  } catch (e) {
    next(e)
  }
}


export const cardController = {
  checkUploadedCustomLogo,
  listCustomUserImages,
  userFavoritesCards,
  updateFavoriteCard,
  uploadCustomLogo,
  deleteCustomCard,
  deleteCustomLogo,
  createCustomCard,
  section,
  random,
  list,
  view,
}
