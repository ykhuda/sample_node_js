import db from '../../../../db/models'
import {isCustom, isCustomized} from '../../admin/controllers/Cards.js'
import {getUrl} from '../../../../helpers/utils/media/getUrl.js'
import {getDataByUid} from "./Users.js";
import constants from "../../../../helpers/constants/constants.js";
import {categoryService} from "../services";

const {OK} = constants;

const getList = async (user, platform, forCards = 0) => {
  let categoryIds = await categoryService.categoryForUserGroup(user)
  const categories = await categoryService.getCategoryListWithoutGroups(categoryIds, platform)

  const category = []
  for (let i = 0; i < categories.length; i++) {
    if (user && !user?.can_customize_card) {
      if (isCustom(categories[i]) || isCustomized(categories[i])) {
        continue
      }
    }

    if (isCustomized(categories[i])) {
      if (platform === 'iOS/App' || platform === 'Android/App') {
        continue
      }
    }

    if (isCustom(categories[i])) {
      if (!user) {
        continue
      }
      const find = await db.card.count({where: {user_id: user.id, category_id: categories[i].id, status: 0}})

      if (find === 0) {
        continue
      }
    }

    if (categories[i].taxonomy !== 'VERIZON') {
      forCards ? category.push(categories[i].id) : category.push({
        id: categories[i].id,
        name: categories[i].name,
        slug: categories[i].slug,
        meta_title: categories[i].meta_title,
        meta_description: categories[i].meta_description,
        checked: categories[i].checked,
        taxonomy: categories[i].taxonomy,
        icon: getUrl(categories[i].icon),
      })
    }
  }

  return category
}


const list = async (req, res, next) => {
  try {
    const {headers: {authorization}, query: {forCards, page, limit}} = req
    const {locals: {platform}} = res

    const user = await getDataByUid(authorization);

    let categories = await getList(user, platform, forCards, page, limit)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      categories: [
        {
          id: -1,
          name: 'All Categories',
          slug: ' ',
          taxonomy: 'NONE'
        },
        ...(user ? [{id: 0, name: 'Favorites', slug: 'favorites', taxonomy: 'NONE'}] : []),
        ...categories]
    })
  } catch (e) {
    next(e)
  }
}
const categoriesController = {
  list
}

export {
  categoriesController,
  getList,
}
