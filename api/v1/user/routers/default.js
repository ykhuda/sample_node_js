import app from 'express';


import {checkUid} from '../../../../middlewares/access.js';
import platform from "../../../../middlewares/platform.js";
import {defaultController} from "../controllers/Default.js";
import constants from '../../../../helpers/constants/constants.js';


const {UNAUTHORIZED} = constants;
const router = app.Router();

// rename getCustomCssFile?
router.get('/getCustomCss', defaultController.getCustomCss);

router.post('/feedBack', checkUid([UNAUTHORIZED, 'no auth']), defaultController.feedBack);

router.post('/whitepaper', checkUid([UNAUTHORIZED, 'no auth']), defaultController.whitePaper);

router.post('/samples', checkUid([UNAUTHORIZED, 'no auth']), defaultController.sample);

router.post('/registerToken', platform, defaultController.registerToken);


export const DefaultRouter = router
