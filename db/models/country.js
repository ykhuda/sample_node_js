export default (sequelize, DataTypes) => sequelize.define('country', {
  id: {
    autoIncrement: true,
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  delivery_cost: {
    type: DataTypes.DECIMAL(6, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  aliases: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  sequelize,
  tableName: 'country',
  timestamps: false,
  indexes: [
    {
      name: 'PRIMARY',
      unique: true,
      using: 'BTREE',
      fields: [
        {name: 'id'},
      ],
    },
  ],
});
