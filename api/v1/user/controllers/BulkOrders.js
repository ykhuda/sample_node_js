import xlsx from 'xlsx';
import lodash from 'lodash'

import db from "../../../../db/models";
import constants from "../../../../helpers/constants/constants.js";
import {ErrorHandler} from "../../../../middlewares/error.js";

const {XML_MIMETYPE, CSV_MIMETYPE, NOT_FOUND, INVALID_DATA, OK, ADDRESS_DEFAULT_VALUE} = constants

const setAddressTo = (res) => ({
  to_name: `${res['To Address First Name'] ? res['To Address First Name'] : ''}${res['To Address Last Name (opt)'] ? ` ${res['To Address Last Name (opt)']}` : ''}`,
  to_first_name: res['To Address First Name'] ? res['To Address First Name'] : ADDRESS_DEFAULT_VALUE,
  ...(res['To Address Last Name (opt)'] ? {to_last_name: res['To Address Last Name (opt)']} : {}),
  ...(res['To Address Business (opt)'] ? {to_business_name: res['To Address Business (opt)']} : {}),
  to_address1: res['To Address Line 1'] ? res['To Address Line 1'] : ADDRESS_DEFAULT_VALUE,
  ...(res['To Address Line 2 (opt)'] ? {to_address2: res['To Address Line 2 (opt)']} : {}),
  to_city: res['To Address City'] ? res['To Address City'] : ADDRESS_DEFAULT_VALUE,
  to_state: res['To Address State'] ? res['To Address State'] : ADDRESS_DEFAULT_VALUE,
  to_zip: res['To Address Zip'] ? res['To Address Zip'] : ADDRESS_DEFAULT_VALUE,
  to_country: res['To Address Country'] ? res['To Address Country'] : ADDRESS_DEFAULT_VALUE,
})

const setAddressFrom = (res) => ({
  return_name: `${res['Return Address First Name'] ? res['Return Address First Name'] : ''}${res['Return Address Last Name (opt)'] ? ` ${res['Return Address Last Name (opt)']}` : ''}`,
  return_first_name: res['Return Address First Name'] ? res['Return Address First Name'] : ADDRESS_DEFAULT_VALUE,
  ...(res['Return Address Last Name (opt)'] ? {return_last_name: res['Return Address Last Name (opt)']} : {}),
  ...(res['Return Address Business (opt)'] ? {return_business_name: res['Return Address Business (opt)']} : {}),
  return_address1: res['Return Address Line 1'] ? res['Return Address Line 1'] : ADDRESS_DEFAULT_VALUE,
  ...(res['Return Address Line 2 (opt)'] ? {return_address2: res['Return Address Line 2 (opt)']} : {}),
  return_city: res['Return Address City'] ? res['Return Address City'] : ADDRESS_DEFAULT_VALUE,
  return_state: res['Return Address State'] ? res['Return Address State'] : ADDRESS_DEFAULT_VALUE,
  return_zip: res['Return Address Zip'] ? res['Return Address Zip'] : ADDRESS_DEFAULT_VALUE,
  return_country: res['Return Address Country'] ? res['Return Address Country'] : ADDRESS_DEFAULT_VALUE,
})

const formattingBasicRow = (row) => ({
  ...setAddressFrom(row),
  ...setAddressTo(row),
  message: row.Message,
  wishes: row['Sign Off (opt)'],
  ...(row['Send Date (opt)'] ? {date: row['Send Date (opt)']} : {})
})

const formattingAdvancedRow = (row) => {
  const array = []
  for (let i = 1; i < 8; i++) {
    row[`Replacement Key${i}`] && array.push({
      key: row[`Replacement Key${i}`],
      value: row[`Replacement Value${i}`]
    })
  }
  return {
    ...setAddressFrom(row),
    ...setAddressTo(row),
    message: row['Message - Don\'t Change Directly!'],
    wishes: row['Sign Off (opt) - Don\'t Change Directly!'],
    ...(row['Send Date (opt)'] ? {date: row['Send Date (opt)']} : {}),
    replacement_array: array,
  }
}

const checkValidFile = (rows, countries, sheet) => {
  let returnCountry
  let toCountry
  const addresses = []
  let correct_zip = true

  let row = 2
  for (const [index, value] of rows.entries()) {
    const data = sheet === 'Basic' ? formattingBasicRow(value) : formattingAdvancedRow(value)

    returnCountry = countries.find(({name}) => name.toLowerCase() === data.return_country.toLowerCase())

    toCountry = countries.find(({name}) => name.toLowerCase() === data.to_country.toLowerCase())


    const {to_zip, return_zip} = data;
    if (+to_zip) {
      if (rows.length - 1 > index && rows.length - 2 > index) {
        const {to_zip: to_zip2} = sheet === 'Basic' ? formattingBasicRow(rows[index + 1]) : formattingAdvancedRow(rows[index + 1])
        const {to_zip: to_zip3} = sheet === 'Basic' ? formattingBasicRow(rows[index + 2]) : formattingAdvancedRow(rows[index + 2])
        if (+to_zip === to_zip2 - 1 && +to_zip2 === to_zip3 - 1) {
          correct_zip = false
        }
      }
    }

    if (+return_zip) {
      if (rows.length - 1 > index && rows.length - 2 > index) {
        const {return_zip: return_zip2} = sheet === 'Basic' ? formattingBasicRow(rows[index + 1]) : formattingAdvancedRow(rows[index + 1])
        const {return_zip: return_zip3} = sheet === 'Basic' ? formattingBasicRow(rows[index + 2]) : formattingAdvancedRow(rows[index + 2])
        if (+return_zip === return_zip2 - 1 && +return_zip2 === return_zip3 - 1) {
          correct_zip = false
        }
      }
    }
    const checkToCountry = toCountry === "United States";

    const checkReturnCountry = returnCountry === "United States";

    if (+to_zip?.length !== 5 && checkToCountry) {
      correct_zip = false
    }

    if (+return_zip?.length !== 5 && checkReturnCountry) {
      correct_zip = false
    }

    if (!to_zip) {
      correct_zip = false
    }

    if (!return_zip) {
      correct_zip = false
    }


    addresses.push({
      ...data,
      row,
      sheet,
      to_country: toCountry ? toCountry : null,
      return_country: returnCountry ? returnCountry : null
    })
    row++
  }
  return {
    correct_zip,
    addresses,
  }
}


const replaceString = (arr, mess) => {
  arr.map(rep => {
    if (mess.includes(rep.key)) {
      const regex = new RegExp(rep.key, "g");
      mess = mess.replace(regex, rep.value)
      if (mess.includes(rep.key)) {
        replaceString(arr, mess)
      }
    }
  })
  return mess
}

const parseXml = async (req, res, next) => {
  try {

    const {user, files: {file}, body: {cardId}} = req

    if (!file) throw new ErrorHandler(INVALID_DATA, 'File not selected')

    if (!cardId) throw new ErrorHandler(INVALID_DATA, 'Wrong selected card')


    const [card, signatures, countries] = await Promise.all([
      db.card.findByPk(cardId, {raw: true}),
      db.signatures.findAll({
        where: {
          user_id: user.id
        },
        raw: true
      }),
      db.country.findAll({raw: true, nest: true})
    ])

    if (!card) throw new ErrorHandler(NOT_FOUND, 'Card not found')

    if (file.mimetype !== XML_MIMETYPE && file.mimetype !== CSV_MIMETYPE) {
      throw new ErrorHandler(INVALID_DATA, 'File extension no correct')
    }

    let fileRead = xlsx.read(file.data);

    if (!fileRead) {
      throw new ErrorHandler(INVALID_DATA, 'File not valid!')
    }


    let dataBasic = []
    let dataAdvanced = []
    let validate_data = []

    const existBasic = fileRead.SheetNames.some(sheet => sheet === 'Basic');
    const existAdvanced = fileRead.SheetNames.some(sheet => sheet === 'Advanced');
    if (fileRead?.SheetNames && (fileRead.SheetNames.length !== 5 || !existBasic || !existAdvanced)) {
      throw new ErrorHandler(INVALID_DATA, 'File does not match the sample!')
    }

    const sheets = fileRead.SheetNames.filter((v) => v !== 'INSTRUCTIONS' && v !== 'Countries');

    let fileEmpty = false
    let correct_postal_code = false;


    let int
    for (let i = 0; i < sheets.length; i++) {
      if (sheets[i] === 'Basic') {
        const temp = xlsx.utils.sheet_to_json(fileRead.Sheets[sheets[i]])

        if (lodash.isEmpty(temp)) {
          fileEmpty = true;
          i++
        }

        const {addresses, correct_zip} = checkValidFile(temp, countries, sheets[i])
        correct_postal_code = correct_zip
        dataBasic = addresses.map((res) => {
          if (res.to_country && res.to_country.id !== 1) {
            int = 1
          }

          let date
          if (typeof +res.date === "number") {
            const timestamp = (res.date - 25569) * 84600
            date = new Date(timestamp)
          } else {
            date = new Date(res.date)
          }

          const {return_country, to_country, ...restRow} = res
          return {
            ...restRow,
            ...(res.return_country ? {return_country_id: res.return_country.id} : {return_country_id: 0}),
            ...(res.to_country ? {to_country_id: res.to_country.id} : {to_country_id: 0}),
            ...(date ? {date_send: date} : {}),
            ...(signatures[0] ? {signature_id: signatures[0].id, signature_code: signatures[0].code} : {}),
            ...(signatures[1] ? {signature2_id: signatures[1].id, signature2_code: signatures[1].code} : {}),
          }
        })
      }
      if (sheets[i] === 'Advanced') {
        const temp = xlsx.utils.sheet_to_json(fileRead.Sheets[sheets[i]])

        if (lodash.isEmpty(temp)) {
          fileEmpty = true;
          i++
        }
        const {addresses, correct_zip} = checkValidFile(temp, countries, sheets[i]);
        correct_postal_code = correct_postal_code ? correct_zip : correct_postal_code
        dataAdvanced = addresses.map((res) => {
          if (res.to_country && res.to_country.id !== 1) {
            int = 1
          }

          let date
          if (typeof res.date === "number") {
            const timestamp = (res.date - 25569) * 84600
            date = new Date(timestamp)
          } else {
            date = new Date(res.date)
          }


          if (res.replacement_array.length > 0) {
            const temp = xlsx.utils.sheet_to_json(fileRead.Sheets[sheets[i + 1]])
            temp.map((template) => {
              let mess = template['Your Message']
              let singOff = template['Your Sign Off']
              if (singOff) {
                res.wishes = replaceString(res.replacement_array, singOff)
              }
              if (mess) {
                res.message = replaceString(res.replacement_array, mess)
              }
            })
          }

          const {replacement_array, return_country, to_country, ...restRow} = res

          return {
            ...restRow,
            ...(res.to_country ? {return_country_id: 1} : {...(res.to_country ? {return_country_id: res.to_country.id} : {return_country_id: 0})}),
            ...(res.to_country ? {to_country_id: 1} : {...(res.to_country ? {to_country_id: res.to_country.id} : {to_country_id: 0})}),
            ...(date ? {date_send: date} : {}),
            ...(signatures[0] ? {signature_id: signatures[0].id, signature_code: signatures[0].code} : {}),
            ...(signatures[1] ? {signature2_id: signatures[1].id, signature2_code: signatures[1].code} : {}),
          }
        })
      }

    }
    if (fileEmpty) {
      throw new ErrorHandler(INVALID_DATA, 'File empty!')
    }

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      data: [...dataBasic, ...dataAdvanced],
      int,
      validate_data,
      correct_postal_code,
    })
  } catch (e) {
    next(e)
  }
}
export {
  parseXml,
  replaceString
}
