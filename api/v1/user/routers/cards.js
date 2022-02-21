import app from 'express';

import {cardController} from '../controllers/Cards.js';
import {cardMiddleware} from "../../../../middlewares";
import {checkUid} from '../../../../middlewares/access.js';
import constants from '../../../../helpers/constants/constants.js';
import platformMW from '../../../../middlewares/platform.js';
import checkPhotoType from '../../../../middlewares/check_photo_type.js';

const {UNAUTHORIZED} = constants;

const router = app.Router();

router.get(
  '/list',
  platformMW,
  cardMiddleware.byCategory,
  cardController.list
);

router.get(
  '/list/sections',
  platformMW,
  cardMiddleware.byCategory,
  cardController.section
);

router.get(
  '/listCustomUserImages',
  checkUid([UNAUTHORIZED, 'no auth']),
  cardController.listCustomUserImages
);

router.get(
  '/random',
  checkUid([UNAUTHORIZED, 'no auth']),
  cardController.random
);

router.post(
  '/deleteCustomLogo',
  checkUid([UNAUTHORIZED, 'no auth']),
  cardController.deleteCustomLogo
);

router.post(
  '/deleteCustomCard',
  checkUid([UNAUTHORIZED, 'no auth']),
  cardController.deleteCustomCard
);

router.post(
  '/checkUploadedCustomLogo',
  checkUid([UNAUTHORIZED, 'no auth']),
  cardController.checkUploadedCustomLogo
);

router.get(
  '/view',
  checkUid([UNAUTHORIZED, 'no auth']),
  cardController.view
);

router.post(
  '/createCustomCard',
  checkUid([UNAUTHORIZED, 'no auth']),
  cardController.createCustomCard
);


router.post(
  '/uploadCustomLogo',
  checkUid([UNAUTHORIZED, 'no auth']),
  checkPhotoType,
  cardController.uploadCustomLogo
);

router.post(
  '/favorite',
  checkUid([UNAUTHORIZED, 'no auth']),
  cardController.updateFavoriteCard
);

router.get(
  '/favorite',
  checkUid([UNAUTHORIZED, 'no auth']),
  cardController.userFavoritesCards
);

export const CardRouter = router;
