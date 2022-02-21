'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(t => {
    return queryInterface.addColumn('shipping_methods', 'sort_order', {
      type: Sequelize.INTEGER(10),
      defaultValue: 0,
      allowNull: false
    }, {transaction: t})
  }),

  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(t => {
    return queryInterface.removeColumn('shipping_methods', 'sort_order', {transaction: t})
  }),
};
