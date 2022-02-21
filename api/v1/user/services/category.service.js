import sequelize from "sequelize";

import db from "../../../../db/models";

const {Op} = sequelize;

const getCategoryListWithoutGroups = (categoryIds, platform) => db.category.findAll({
  attributes: ['id', 'name', 'sort', 'slug', 'meta_title', 'meta_description', 'checked', 'taxonomy', 'icon'],
  where: {
    // id: {[Op.not]: null},
    [Op.or]: [
      {id: {[Op.not]: categoryIds}},
    ],
    ...(platform && (platform === 'iOS/App' || platform === 'Android/App') ? {taxonomy: {[Op.or]: ['CUSTOMIZED', null]}} : {}),
  },
  include: [
    {
      model: db.card,
      attributes: ['id'],
      where: {
        status: 0,
        quantity: {[Op.gt]: 0},
        price: {[Op.gt]: 0},
      },
    },
    {
      model: db.card,
      as: 'card',
      attributes: ['id'],
      through: {attributes: []},
      required: false,
      where: {
        status: 0,
        quantity: {[Op.gt]: 0},
        price: {[Op.gt]: 0},
      },
    },
    {
      model: db.user_group_categories,
      attributes: ['id'],
      required: false,
    },
    {
      model: db.category_user_groups,
      attributes: ['id'],
      required: false,
    }
  ],
  group: 'id',
  order: [['sort', 'DESC'], ['id', 'DESC']],
  raw: true,
  nest: true,
})


const categoryForUserGroup = async (user) => {
  let categoryIds = await db.category_user_groups.findAll({
    where: {
      ...(user?.group_id ? {
        user_group_id: {[Op.not]: user.group_id}
      } : {})
    },
    attributes: ['category_id']
  })
  const mySet = new Set(categoryIds.map(({category_id}) => category_id))
  return [...mySet]
}


export const categoryService={
  categoryForUserGroup,
  getCategoryListWithoutGroups
};
