export class DateYmdHis {
  constructor() {
    this.date = new Date()
  }

  convertedDate() {
    const datestr = this.date.toLocaleDateString('en-Us', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })

    return datestr.split('/').reverse()
  }

  convertedTime() {
    const timestr = this.date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    return timestr.split(':')
  }

  merged() {
    return [...this.convertedDate(), ...this.convertedTime()]
  }
}
