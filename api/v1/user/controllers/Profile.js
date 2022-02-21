import axios from "axios";
import xml2js from "xml2js";
import xlsx from "xlsx";
import lodash from "lodash";
import sequelize from "sequelize";

import db from "../../../../db/models";
import constants from "../../../../helpers/constants/constants.js";
import {sendMail} from "../../../../helpers/utils/mail/mail.js";
import {convert} from "../../../../helpers/utils/convert"
import {
  deleteEntity,
  findEntity,
  isRecordExist,
  simpleCreateEntity,
  simpleUpdateEntity,
  transaction,
} from "../../../../helpers/utils/model.utils.js";
import {ErrorHandler} from "../../../../middlewares/error.js";
import {
  encryptPassword,
  genRandomStr,
  validatePassword,
} from "../../../../helpers/utils/crypto.js";
import {findDefault} from "../../admin/controllers/client/CreditCard.js";
import {getActive} from "../../admin/controllers/client/Subscription.js";
import {log} from "../../../../helpers/utils/activity.js";

import {
  signatureService,
  addressesService,
  profileService,
} from "../services";
import {getTotalByUserID} from "./CreditCards.js";
import {userCreditHelper} from "../../../../helpers/utils";
import excelDateToJSDate from "../../../../helpers/utils/convert/excelDateToJSDate.js";

const {Op} = sequelize;
const {
  INVALID_DATA,
  emailTemplates: {BASE_NOTIFICATION},
  XML_MIMETYPE,
  CSV_MIMETYPE,
  OK,
  WEB_ROUTES,
  WEB_APP_URL,
  ADDRESS_BOOK_SHEET_NAME
} = constants;

//Profile
const changeUserEmail = (req, res, next) =>
  transaction(async (t) => {
    try {
      const {
        body: {login: enteredLogin, password, new_email: newLogin},
        user,
      } = req;
      const {password: hasPassword, login: currLogin} = user;

      if (!hasPassword)
        throw new ErrorHandler(
          INVALID_DATA,
          "The accaunt doesn't use password."
        );
      if (!password)
        throw new ErrorHandler(INVALID_DATA, "Password is required");
      if (!enteredLogin)
        throw new ErrorHandler(INVALID_DATA, "Login is required");
      if (!newLogin)
        throw new ErrorHandler(INVALID_DATA, "New login is required");
      if (currLogin !== enteredLogin)
        throw new ErrorHandler(
          INVALID_DATA,
          "Entered login doesn't match your current login."
        );
      if (!(await validatePassword(password, hasPassword))) {
        throw new ErrorHandler(INVALID_DATA, "Password is incorrect.");
      }

      if (newLogin.search(/\w+@\w+\.\w+/gi) === -1) {
        throw new ErrorHandler(INVALID_DATA, "New login is invalid.");
      }

      const isLoginExist = await findEntity("user", null, {login: newLogin});

      if (isLoginExist)
        throw new ErrorHandler(
          INVALID_DATA,
          "User with such login is already exist."
        );

      await Promise.all([
        db.user.update(
          {login: newLogin},
          {where: {login: enteredLogin}, transaction: t}
        ),
        mail.emailChanges(newLogin, enteredLogin),
      ]);

      res.status(OK).json({
        httpCode: OK,
        status: "ok",
        message: "The email has been changed.",
      });
    } catch (e) {
      next(e);
    }
  });

const changeProfilePassword = (req, res, next) =>
  transaction(async (t) => {
    try {
      const {
        body: {old_password, new_password},
        user: {password, login, id},
      } = req;
      if (!password)
        throw new ErrorHandler(
          INVALID_DATA,
          "The accaunt doesn't use password."
        );

      if (!old_password)
        throw new ErrorHandler(INVALID_DATA, "Old password is required.");
      if (!new_password)
        throw new ErrorHandler(INVALID_DATA, "New password is required.");
      if (old_password === new_password)
        throw new ErrorHandler(INVALID_DATA, "Entered passwords are the same.");

      if (!(await validatePassword(old_password, password))) {
        throw new ErrorHandler(INVALID_DATA, "Password is incorrect.");
      }

      req.session.destroy(async () => {
        await Promise.all([
          db.auth_uid.destroy({where: {user_id: id}}, {transaction: t}),
          log(
            req,
            "client",
            {
              controller: "client",
              action: "logout",
            },
            t
          ),
        ]);
      });

      await Promise.all([
        db.user.update(
          {password: await encryptPassword(new_password)},
          {where: {login}, transaction: t}
        ),
        mail.passwordChanges(login),
      ]);
      res.status(OK).json({
        httpCode: OK,
        status: "ok",
        message: "Password has been changed.",
      });
    } catch (e) {
      next(e);
    }
  });

const shareOptions = async (req, res, next) => {
  try {
    const {rows} = await findEntity("share_option");
    const {
      locals: {platform},
    } = res;

    let linkFieldName = "link";

    if (platform === "Android/App") {
      linkFieldName = "link_android";
    }

    const result = {};

    rows.forEach((option) => {
      const {text, name} = option;
      const link = option[linkFieldName];

      result[name] = {
        link,
        text,
      };
    });

    res.status(OK).json({
      httpCode: OK,
      status: "ok",
      options: {
        ...result,
      },
    });
  } catch (e) {
    next(e);
  }
};

const getAuthorizeNetInfo = (req, res, next) => {
  try {
    const {headers} = req;
    if (
      !process.env.AUTHORIZENET_TRANSACTION_KEY ||
      !process.env.AUTHORIZENET_API_LOGIN_ID
    ) {
      throw new ErrorHandler(
        INVALID_DATA,
        "authorize.net credentials are not defined"
      );
    }

    let anetInfo = {
      transaction_key: genRandomStr(8),
      client_key: process.env.ANET_CLIENT_KEY,
      login_id: process.env.AUTHORIZENET_API_LOGIN_ID,
    };
    const secret = headers.authorizenetsecret || headers.AuthorizeNetSecret;
    if (!secret || secret !== process.env.ANET_SECRET_KEY) {
      anetInfo = {
        transaction_key: genRandomStr(8),
        client_key: genRandomStr(16),
        login_id: genRandomStr(4),
      };
    }
    res.status(OK).json({
      httpCode: OK,
      status: "ok",
      authorizenet_info: anetInfo,
    });
  } catch (e) {
    next(e);
  }
};

const shareApp = async (req, res, next) => {
  try {
    const {
      body: {network},
      user: {shared, id: userId, free_cards},
    } = req;

    const networks = ["twitter", "facebook", "mail"];

    if (!network && !networks.some((value) => value === network)) {
      throw new ErrorHandler(INVALID_DATA, "network error");
    }
    await simpleUpdateEntity("user", {id: userId}, {shared: 7});

    res.status(OK).json({
      httpCode: OK,
      status: "ok",
      free_cards,
      shared: networks.reduce(
        (acc, networkType) => (acc[networkType] === networkType) === shared,
        {}
      ),
    });
  } catch (e) {
    next(e);
  }
};

const signature = async (req, res, next) => {
  try {
    const {
      user: {id},
    } = req;

    const signatures = await signatureService.getSignatures(id);

    res.status(OK).json({
      httpCode: OK,
      status: "ok",
      signatures,
    });
  } catch (e) {
    next(e);
  }
};

const updateBillingInfo = (req, res, next) =>
  transaction(async (t) => {
    try {
      const {
        body: {country_id, address, zip},
        user: {id},
      } = req;

      if (!country_id)
        throw new ErrorHandler(INVALID_DATA, "Country is required.");
      if (!address)
        throw new ErrorHandler(INVALID_DATA, "Address is required.");
      if (!zip) throw new ErrorHandler(INVALID_DATA, "Zip is required.");
      if (!(await isRecordExist("country", {id: country_id})))
        throw new ErrorHandler(INVALID_DATA, "No such country.");

      await profileService.setBillingInfo(id, address, country_id, zip);

      res.status(OK).json({
        httpCode: OK,
        status: "ok",
      });
    } catch (e) {
      next(e);
    }
  });

const settings = async (req, res, next) => {
  try {
    const {
      user: {
        id,
        credit,
        billing_zip,
        billing_country_id,
        billing_address,
        test_mode,
        login,
        password,
        last_logged_with,
        google_id,
        facebook_id,
      },
    } = req;

    const default_credit_card = await findDefault(id);
    const totalNonExpiring = await getTotalByUserID(id, 1);
    const totalExpiring = await getTotalByUserID(id, 2);
    const nearest = await userCreditHelper.getOneExpiring(id);
    const country = await findEntity("country", billing_country_id);
    const subscription = await getActive(id, default_credit_card);
    let loginInfo;

    const total_nonexp = totalNonExpiring
      ? totalNonExpiring.total_nonexp
      : null;
    const total_exp = totalExpiring ? totalExpiring.total_exp : null;

    let billing_info = {
      address: billing_address,
      zip: billing_zip,
      country: country.name,
      country_id: billing_country_id,
    };

    if (password) {
      loginInfo = {
        has_no_password: 0,
        email: login,
        logged_with: "email",
      };
    } else {
      loginInfo = {
        has_no_password: 1,
        email: null,
        // eslint-disable-next-line no-nested-ternary
        logged_with:
          last_logged_with ||
          (google_id ? "google" : facebook_id ? "facebook" : null),
      };
    }

    if (!billing_info && !billing_country_id && !billing_address)
      billing_info = null;

    res.status(OK).json({
      httpCode: OK,
      status: "ok",
      credit1: credit,
      credit2: total_nonexp,
      expiring_credit2: total_exp,
      nearest_expiring_credit2: nearest,
      default_credit_card,
      billing_info,
      subscription,
      has_no_password: password ? 1 : 0,
      test_mode,
      ...loginInfo,
    });
  } catch (e) {
    next(e);
  }
};

const getCredits = async (req, res, next) => {
  try {
    const {id} = req.user;

    const credits = await getTotalByUserID(id);

    res.status(OK).json({credits});
  } catch (e) {
    next(e);
  }
};

//address
const deleteAddress = async (req, res, next) => {
  try {
    const {
      body: {address_id, address_ids},
      user,
    } = req;
    await deleteEntity("address", {
      id: address_id || address_ids,
      type: "user_from",
    });

    const userAddress = await db.address.findOne({
      where: {
        type: "user_from",
        user_id: user.id,
      },
    });

    // if user delete default address, set another default id
    await simpleUpdateEntity(
      "address",
      {
        id: user.id,
        type: "user_from",
      },
      {default_return_address_id: userAddress ? userAddress.id : null}
    );

    res.status(OK).json({
      httpCode: OK,
      status: "ok",
    });
  } catch (e) {
    next(e);
  }
};

const setDefaultAddress = async (req, res, next) => {
  try {
    const {
      body: {id},
      user,
    } = req;
    const userAddress = await db.address.findByPk(id, {raw: true});

    if (!userAddress) throw new ErrorHandler(400, "bad id.");

    await simpleUpdateEntity(
      "user",
      {id: user.id},
      {default_return_address_id: userAddress.id}
    );

    res.status(OK).json({
      httpCode: OK,
      status: "ok",
    });
  } catch (e) {
    next(e);
  }
};

const update = (req, res, next) =>
  transaction(async (t) => {
    try {
      const {body, user} = req;
      const {id} = user;

      // await checkAddress(body)
      const changes = await updateAddress(id, body);
      await simpleUpdateEntity(
        "address",
        {type: "user_from", user_id: id, id: body.id},
        changes,
        t
      );

      const result = await db.address.findOne({
        where: {id: body.id},
        attributes: [
          "id",
          "name",
          "first_name",
          "last_name",
          "business_name",
          "address1",
          "address2",
          "city",
          "state",
          "zip",
          "country_id",
          "country",
          "delivery_cost",
        ],
        raw: true,
      });

      const {delivery_cost = null, ...rest} = result;
      const {billing_country_id, billing_zip} = user;

      const address = {
        ...rest,
        country_obj: {
          id: result.id,
          name: result.country,
          delivery_cost,
        },
      };

      if (!billing_country_id || !billing_zip) {
        await profileService.setBillingInfo(
          user.id,
          address.address1,
          address.country_id,
          address.zip,
          t
        );
      }

      res.status(OK).json({
        httpCode: OK,
        status: "ok",
        addresses: [address],
      });
    } catch (e) {
      next(e);
    }
  });

const create = (req, res, next) =>
  transaction(async (t) => {
    try {
      const {body, user} = req;

      const {billing_country_id, billing_zip} = user;

      // await checkAddress(body)

      const bodyType = {
        ...body,
        user_id: user.id,
        type: "user_from",
        name: `${body.first_name} ${body.last_name}`.trim(),
      };

      const address = await simpleCreateEntity("address", bodyType, t);

      if (!billing_country_id || !billing_zip) {
        await profileService.setBillingInfo(
          user.id,
          address.address1,
          address.country_id,
          address.zip,
          t
        );
      }
      res.status(OK).json({
        httpCode: OK,
        status: "ok",
        address,
      });
    } catch (e) {
      next(e);
    }
  });

const address = async (req, res, next) => {
  try {
    const {user} = req;

    const {billing_address, billing_zip, billing_country_id} = user;
    let billing_info;

    if (!billing_address && !billing_zip && !billing_country_id) {
      billing_info = null;
    } else {
      const country = billing_country_id
        ? await db.country.findByPk(billing_country_id, {
          attributes: ["name"],
          raw: true,
        })
        : null;
      billing_info = {
        address: billing_address,
        zip: billing_zip,
        country: country ? country.name : null,
        country_id: billing_country_id,
      };
    }

    const address = await addressesService.getUserAddress(
      user?.default_return_address_id
    );

    const isDefault = address?.id === user?.default_return_address_id;
    res.status(OK).json({
      httpCode: OK,
      status: "ok",
      ...(address ? {address: {...address, default: isDefault}} : {}),
      billing_info,
    });
  } catch (e) {
    next(e);
  }
};

const list = async (req, res, next) => {
  try {
    const {
      user: {id, default_return_address_id},
    } = req;
    const typeList = "user";

    const addresses = await addressesService.listForType(id, typeList);

    res.status(OK).json({
      httpCode: OK,
      status: "ok",
      addresses: addresses.map((address) => ({
        ...address,
        default: address.id === default_return_address_id,
      })),
    });
  } catch (e) {
    next(e);
  }
};

//recipient
const addRecipient = async (req, res, next) => {
  try {
    const {user, body} = req;

    const country = await addressesService.getCountry(body.country_id);

    const addressObj = {
      ...body,
      user_id: user.id,
      type: "user_to",
      country_id: country.id,
      country: country.name,
      delivery_cost: country.delivery_cost,
    };

    const {id} = await simpleCreateEntity("address", addressObj);

    res.status(OK).json({
      httpCode: OK,
      status: "ok",
      address_id: id,
    });
  } catch (e) {
    next(e);
  }
};

const recipientsList = async (req, res, next) => {
  try {
    const {
      user: {id},
    } = req;
    const typeList = "recipient";
    const addresses = await addressesService.findAddress(id, typeList);

    res.status(OK).json({
      httpCode: OK,
      status: "ok",
      addresses,
    });
  } catch (e) {
    next(e);
  }
};

const updateRecipient = (req, res, next) =>
  transaction(async (t) => {
    try {
      const {
        updateObj,
        user: {id},
      } = req;
      // await checkAddress(body)
      await simpleUpdateEntity(
        "address",
        {id: +updateObj.address_id, user_id: id, type: "user_to"},
        updateObj,
        t
      );

      res.status(OK).json({
        httpCode: OK,
        status: "ok",
        address_id: +updateObj.address_id,
      });
    } catch (e) {
      next(e);
    }
  });

const deleteRecipient = (req, res, next) =>
  transaction(async (t) => {
    try {
      const {
        body: {address_id, address_ids},
        user,
      } = req;
      if (address_id && typeof +address_id !== "number")
        throw new ErrorHandler(INVALID_DATA, "address id error");

      let ids = [...address_ids];

      if (address_id) {
        ids.push(+address_id);
      }

      await deleteEntity(
        "address",
        {type: "user_to", user_id: user.id, id: {[Op.in]: ids}},
        t
      );

      res.status(OK).json({
        httpCode: OK,
        status: "ok",
      });
    } catch (e) {
      next(e);
    }
  });

//ParseXls
const parseXls = async (req, res, next) => {
  try {
    const {
      user,
      files: {file},
    } = req;

    if (!file) throw new ErrorHandler(INVALID_DATA, "File not selected");

    const {recipients, new_address, validate_data, correct_file, total} = await parse(user, file);

    res.status(OK).json({
      httpCode: OK,
      status: "ok",
      recipients,
      total,
      new_address,
      validate_data,
      correct_file,
    });
  } catch (e) {
    next(e);
  }
};

//helper

/**
 * Add new or update exists user`s address
 * @param {number} uId - a user id
 * @param {object} params - an object of props to update
 * @returns {Promise<object>} params - an object of props to update
 */
const updateAddress = async (
  uId,
  {country_id, country_name, ...restParams}
) => {
  const where = country_id
    ? {id: country_id}
    : country_name
      ? {country_name}
      : {id: 1};
  const country = await findEntity("country", null, where, null, null, null);

  if (!country && country_id)
    throw new ErrorHandler(INVALID_DATA, "Oops! Please check country id");
  if (!country && country_name)
    throw new ErrorHandler(INVALID_DATA, "Oops! Please check country id");
  if (!country)
    throw new ErrorHandler(INVALID_DATA, "Oops! Please check country id");

  return {
    ...restParams,
    country_id: country.id,
    country: country.name,
    delivery_cost: country.delivery_cost,
  };
};

/**
 * Validate address with UPS
 * @param {object} body - an object with entered address info
 * @returns {void}
 */
const checkAddress = async ({address1, address2, city, zip, state}) => {
  const USERID = "834HANDW5394";
  const request = `http://production.shippingapis.com/ShippingApi.dll?API=Verify&XML=
    <AddressValidateRequest USERID="${USERID}">
      <Revision>1</Revision>
      <Address ID="0">
        <Address1>${address1}</Address1>
        <Address2>${address2}</Address2>
        <City>${city}</City>
        <State>${state}</State>
        <Zip5>${zip}</Zip5>
        <Zip4></Zip4>
      </Address>
    </AddressValidateRequest>`;
  const {data} = await axios.post(request);
  let dataToJson;

  xml2js.parseString(data, {explicitArray: false}, (err, result) => {
    if (err) {
      throw new ErrorHandler(INVALID_DATA, err);
    }
    dataToJson = result.AddressValidateResponse.Address;
  });

  if (dataToJson.Error) {
    let err = "Error verifying the address";
    if (dataToJson.Error.Description) {
      err = dataToJson.Error.Description;
      throw new ErrorHandler(INVALID_DATA, err);
    }
  } else {
    const {Zip5, State, ReturnText} = dataToJson;
    if (Zip5 !== zip) throw new ErrorHandler(INVALID_DATA, "Invalid Zip Code.");
    if (State !== state) throw new ErrorHandler(INVALID_DATA, "Invalid State.");

    if (ReturnText) {
      if (address2) {
        throw new ErrorHandler(
          INVALID_DATA,
          "Looks like the address you entered is incorrect. Please check Address 2."
        );
      } else {
        throw new ErrorHandler(
          INVALID_DATA,
          "More information is needed (such as an apartment, suite, or box number) to match to a specific address."
        );
      }
    }
  }
};

const parse = async (user, file) => {
  let new_address = 0;
  let total = 0;
  let recipients = [];
  let validate_data = [];

  let itemCreate = [];
  let itemUpdate = [];
  if (file.mimetype !== XML_MIMETYPE && file.mimetype !== CSV_MIMETYPE) {
    throw new ErrorHandler(INVALID_DATA, 'File extension no correct')
  }

  let fileRead = xlsx.read(file?.data);

  if (
    !fileRead?.SheetNames
    || lodash.isEmpty(fileRead.SheetNames)
    || fileRead.SheetNames.length !== 2
  ) throw new ErrorHandler(INVALID_DATA, 'The selected file is invalid');

  if (fileRead.SheetNames.filter(name => (
    name === ADDRESS_BOOK_SHEET_NAME.ENTRIES ||
    name === ADDRESS_BOOK_SHEET_NAME.COUNTRIES)
  ).length !== 2) throw new ErrorHandler(INVALID_DATA, 'The sheet name is incorrect');

  const sheets = fileRead.SheetNames[0];

  let addresses = xlsx.utils.sheet_to_json(fileRead.Sheets[sheets], {
    header: 0,
    blankrows: true,
  });

  addresses = addresses.filter((address) => !lodash.isEmpty(address));
  validate_data = checkValidateAddressFile(addresses);
  if (validate_data.length === 0) {
    const addressTo = await addressesService.findAddress(user.id);

    addresses.forEach((obj) => {
      const address = transformationAddressArray(obj);
      const {
        first_name,
        last_name,
        country,
        state,
        city,
        address1,
        address2,
        birthday,
      } = transformationAddressObject(obj);
      const check = addressTo.find((a) => {

        let birthdayCheck = false;

        if (birthday) {
          const date = new Date(a.birthday);

          if (
            date.getDay() === birthday.getDay() &&
            date.getMonth() === birthday.getMonth() &&
            date.getFullYear() === birthday.getFullYear()
          ) birthdayCheck = true;

        } else {
          birthdayCheck = true
        }
        return (
          a.first_name === first_name &&
          a.last_name === last_name &&
          a.country === country &&
          a.state === state &&
          a.city === city &&
          a.address1 === address1 &&
          a.address2 === address2 &&
          birthdayCheck
        );
      });
      total++;
      if (check) {
        itemUpdate.push(check.id);
      } else {
        new_address++;
        itemCreate.push([
          user.id,
          "user_to",
          `${first_name} ${last_name}`,
          ...address,
        ]);
      }
    });
    if (itemCreate.length) {
      await addressesService.createAddressList(itemCreate);
    }
    if (itemUpdate.length) {
      await simpleUpdateEntity(
        "address",
        {id: {[Op.or]: itemUpdate}},
        {date_updated: new Date()}
      );
    }
    recipients = await db.sequelize.query(
      `SELECT * FROM \`address\` WHERE type='user_to' and user_id=:userId`,
      {
        type: db.Sequelize.QueryTypes.SELECT,
        replacements: {
          userId: user.id,
        },
      }
    );
  }
  return {
    total,
    new_address,
    recipients,
    validate_data,
    correct_file: !validate_data.length,
  };
};

const transformationAddressArray = (obj) => [
  obj["First Name"],
  obj["Last Name"],
  obj["Business Name"] ? obj["Business Name"] : "",
  obj["Address Line1"],
  obj["Address Line2 (opt)"],
  obj.City,
  obj["State/Province"],
  obj["Postal Code"],
  obj.Country,
  obj["Birth Date (opt)"] ? convert.excelDateToJSDate(obj["Birth Date (opt)"]) : null,
];

const transformationAddressObject = (obj) => ({
  first_name: obj["First Name"],
  last_name: obj["Last Name"],
  business_name: obj["Business Name"] ? obj["Business Name"] : "",
  address1: obj["Address Line1"],
  address2: obj["Address Line2 (opt)"],
  city: obj.City,
  state: obj["State/Province"],
  zip: obj["Postal Code"],
  country: obj.Country,
  birthday: obj["Birth Date (opt)"] ? convert.excelDateToJSDate(obj["Birth Date (opt)"]) : "",
});

const checkValidateAddressFile = (addresses) => {
  let row = 2;
  const validate_data = [];

  if (lodash.isEmpty(addresses)) {
    throw new ErrorHandler(INVALID_DATA, 'File empty!')
  }
  addresses.forEach((a, index) => {
    if (Object.keys(a).length !== 0) {
      const address = transformationAddressObject(a);

      const {zip, country, state, address1, first_name, city} = address;
      const checkCountry = country === "United States";

      //validate zip
      if (+zip) {
        if (addresses.length - 1 > index && addresses.length - 2 > index) {
          let {zip: zip2} = transformationAddressObject(addresses[index + 1]);
          let {zip: zip3} = transformationAddressObject(addresses[index + 2]);
          if (+zip === zip2 - 1 && +zip2 === zip3 - 1) {
            validate_data.push({
              row: `${row}-${row + 2}`,
              field: "Postal Code",
              message: "Simillar zip code, please check zip code",
            });
          }
        }
      }
      if (zip && +zip?.length !== 5 && checkCountry) {
        validate_data.push({
          row,
          field: "Postal Code",
          message: "Postal Code cannot be blank and must be only 5 digits",
        });
      }

      if (!zip) {
        validate_data.push({
          row,
          field: "Postal Code",
          message: "Postal Code cannot be blank",
        });
      }

      //validate country
      if (!country) {
        validate_data.push({
          row,
          field: "Country",
          message: "Country cannot be blank",
        });
      }

      //validate state
      if (state && state.length !== 2 && checkCountry) {
        validate_data.push({
          row,
          field: "State",
          message: "State cannot be blank and must be only 2 characters",
        });
      }
      if (!state) {
        validate_data.push({
          row,
          field: "State",
          message: "State cannot be blank",
        });
      }

      //validate address1
      if (!address1) {
        validate_data.push({
          row,
          field: "Address Line1",
          message: "Address Line1 cannot be blank",
        });
      }

      //validate first_name
      if (!first_name) {
        validate_data.push({
          row,
          field: "First Name",
          message: "First Name cannot be blank",
        });
      }
      if (!city) {
        validate_data.push({
          row,
          field: "City",
          message: "City cannot be blank",
        });
      }
      row++;
    } else row++;
  });
  return validate_data;
};

//mail
const mail = {
  emailChanges: (mail_to, enteredLogin) =>
    sendMail(BASE_NOTIFICATION, mail_to, {
      subject: "Your email has been changed",
      top_tittle: null,
      title: "Your email has been<br>changed",
      message: [
        `According to your recent request, we’ve changed your account email from ${enteredLogin} to ${mail_to}.`,
        "If it wasn’t you or you have any additional questions, please contact our support team.",
      ],
      link: {
        url: `${WEB_APP_URL}${WEB_ROUTES.cards}`,
        text: "START WRYTING",
      },
    }),
  passwordChanges: (mail_to) =>
    sendMail(BASE_NOTIFICATION, mail_to, {
      subject: "Your password has been changed",
      title: "Your password has been<br>changed",
      message:
        "According to your recent request, we’ve changed your account password. If it wasn’t you or you have any additional questions, please contact our support team",
      link: {
        url: WEB_APP_URL,
        text: "START WRYTING",
      },
    }),
};

const profileController = {
  shareOptions,
  setDefaultAddress,
  recipientsList,
  addRecipient,
  parseXls,
  shareApp,
  getAuthorizeNetInfo,
  signature,
  changeUserEmail,
  changeProfilePassword,
  updateBillingInfo,
  deleteAddress,
  settings,
  updateAddress,
  update,
  updateRecipient,
  address,
  list,
  create,
  deleteRecipient,
  getCredits,
};

export {profileController, checkAddress};
