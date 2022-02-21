export default (sequelize, DataTypes) => {
  return sequelize.define('category', {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    sort: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    checked: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 0,
    },
    is_custom: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 0,
    },
    taxonomy: {
      type: DataTypes.ENUM('NONE', 'VERIZON', 'CUSTOM', 'CUSTOMIZED'),
      allowNull: false,
      defaultValue: 'NONE',
    },
    icon: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    meta_title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    meta_description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  }, {
    sequelize,
    tableName: 'category',
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
  })
};
