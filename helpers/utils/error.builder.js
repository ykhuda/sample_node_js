const buildRedtailError = (name_card, name_field) => {
  if (!name_card && !name_field) {
    return 'Storage is not successful'
  }

  if (!name_field) {
    return `Storage is not successful problem in the card - ${name_card}`
  }

  return `Storage is not successful problem in the card - ${name_card} and  field - ${name_field}`
}

export const errorBuilder = {
  buildRedtailError
}
