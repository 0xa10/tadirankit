const hap = require('hap-nodejs')
const { createLogger, format, transports } = require('winston')
const Gree = require('gree-hvac-client')
const qrcode = require('qrcode-terminal')

const logLevels = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
}

const logger = createLogger({
  levels: logLevels,
  level: 'error',
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.errors({ stack: true }),
    format.prettyPrint(),
  ),
  transports: [new transports.Console()],
})


function main() {
  /// environment variables
  if (!('TARGET_IP' in process.env)) {
    logger.fatal('$TARGET_IP must be set.')
	process.exit();
  }
  const TARGET_IP = process.env.TARGET_IP
  const ACCESSORY_NAME = process.env.ACCESSORY_NAME ?? 'Gree AC'

  /// setup Gree client
  let unitProperties = {} // Contains current target device properties

  const client = new Gree.Client({ host: TARGET_IP })

  client.on('update', (updatedProperties, properties) => {
    unitProperties = properties
    logger.debug('received new properties from target: ' + updatedProperties)
    logger.trace(properties)
  })
  client.on('no_response', () => {
    logger.error('no response from target.')
  })

  client.on('connect', client => {
    logger.info('new connection to target: ' + client.getDeviceId())
    /// setup accessory
    const accessory = new hap.Accessory('Tadiran Joy', hap.uuid.generate('hap.tadiran.ac'))
    accessory
      .getService(hap.Service.AccessoryInformation)
      .setCharacteristic(hap.Characteristic.Manufacturer, 'Tadiran')
      .setCharacteristic(hap.Characteristic.Model, 'Joy')
      .setCharacteristic(hap.Characteristic.Name, ACCESSORY_NAME)
      .setCharacteristic(hap.Characteristic.SerialNumber, client.getDeviceId())
      .setCharacteristic(hap.Characteristic.FirmwareRevision, '0.0.1')

    const heaterCoolerService = new hap.Service.HeaterCooler('AC')
    const fanService = new hap.Service.Fan('Fan')

    const activeCharacteristic = heaterCoolerService.getCharacteristic(hap.Characteristic.Active)
    const currentStateCharacteristic = heaterCoolerService.getCharacteristic(
      hap.Characteristic.CurrentHeaterCoolerState,
    )
    const targetStateCharacteristic = heaterCoolerService.getCharacteristic(
      hap.Characteristic.TargetHeaterCoolerState,
    )
    const currentTemperatureCharacteristic = heaterCoolerService.getCharacteristic(
      hap.Characteristic.CurrentTemperature,
    )
    const coolingThresholdTemperatureCharacteristic = heaterCoolerService.getCharacteristic(
      hap.Characteristic.CoolingThresholdTemperature,
    )
    const heatingThresholdTemperatureCharacteristic = heaterCoolerService.getCharacteristic(
      hap.Characteristic.HeatingThresholdTemperature,
    )

    const fanSpeedCharateristic = fanService.getCharacteristic(hap.Characteristic.RotationSpeed)
    const fanActiveCharacteristic = fanService.getCharacteristic(hap.Characteristic.Active)

    /// TODO
    //const displayUnitCharacteristic = heaterCoolerService.getCharacteristic(hap.Characteristic.TemperatureDisplayUnits);
    //const nameCharacteristic = heaterCoolerService.setCharacteristic(hap.Characteristic.Name, ACCESSORY_NAME);

    /// these require a bit more translation from Homekit	terminology to ones more compatible with the AC interface
    //const swingModeCharacteristic = heaterCoolerService.getCharacteristic(hap.Characteristic.SwingMode);

    /// ac active - on/off
    activeCharacteristic
      .onGet(() => {
        logger.debug('Queried current active state: ' + unitProperties.power)
        if (unitProperties.power === 'off') {
          return 0 // Inactive
        }
        return 1 // Active
      })
      .onSet(value => {
        logger.debug('Setting active state to: ' + value)
        switch (value) {
          case 0: // Inactive
            client.setProperty(Gree.PROPERTY.power, Gree.VALUE.power.off)
            break
          case 1: // Active
            client.setProperty(Gree.PROPERTY.power, Gree.VALUE.power.on)
            break
          default:
            logger.debug('Got unexpected value.')
            break
        }
      })

    /// fan active - on/off
    fanActiveCharacteristic
      .onGet(() => {
        logger.debug('Queried current fan active state: ' + unitProperties.power)
        if (unitProperties.power === 'off') {
          return 0 // Inactive
        }
        return 1 // Active
      })
      .onSet(value => {
        logger.debug("Fan active state request received, ignoring.")
      })

    /// current state - heating/cooling + on/off
    currentStateCharacteristic.onGet(() => {
      const power = unitProperties.power
      const mode = unitProperties.mode

      logger.debug('Queried current heater cooler state: ' + power + ' ' + mode)
      if (power === 'off') {
        return 0 // Inactive
      }

      switch (mode) {
        case 'cool':
          return 3 // Cooling
          break
        case 'heat':
          return 2 // Heating
          break
        default:
          logger.debug('Unhandled mode ' + mode)
          return 1 // Idle
      }
    })

    /// target state - heating/cooling
    targetStateCharacteristic
      .onGet(() => {
        const power = unitProperties.power
        const mode = unitProperties.mode

        logger.debug('Queried target heater cooler state: ' + power)
        switch (mode) {
          case 'cool':
            return 2 // Cooling
            break
          case 'heat':
            return 1 // Heating
            break
          case 'auto':
            return 0 // Auto
            break
          default:
            logger.debug('Unhandled mode ' + mode)
            return 0 // Auto
        }
      })
      .onSet(value => {
        logger.debug('Setting target heater cooler state to: ' + value)
        switch (value) {
          case 0: // Auto
            client.setProperty(Gree.PROPERTY.mode, Gree.VALUE.mode.auto)
            break
          case 1: // Heat
            client.setProperty(Gree.PROPERTY.mode, Gree.VALUE.mode.heat)
            break
          case 2: // Cool
            client.setProperty(Gree.PROPERTY.mode, Gree.VALUE.mode.cool)
            break
          default:
            logger.debug('Unexpected value.')
            return 0 // Auto
        }
      })

    /// rotation speed
    fanSpeedCharateristic
      .setProps({
        minValue: 0,
        maxValue: 3,
        minStep: 1,
      })
      .onGet(() => {
        const fanSpeed = unitProperties.fanSpeed

        logger.debug('Queried fan speed state: ' + fanSpeed)
        switch (fanSpeed) {
          case 'auto':
            return 0 // Auto
            break
          case 'low':
            return 1 // Low
            break
          case 'medium':
            return 2 // Medium
            break
          case 'high':
            return 3 // High
            break
          default:
            logger.debug('Unhandled mode ' + mode)
            return 0 // Auto
        }
      })
      .onSet(value => {
        logger.debug('Setting target fan speed to: ' + value)
        switch (value) {
          case 0: // Auto
            client.setProperty(Gree.PROPERTY.fanSpeed, Gree.VALUE.fanSpeed.auto)
            break
          case 1: // low
            client.setProperty(Gree.PROPERTY.fanSpeed, Gree.VALUE.fanSpeed.low)
            break
          case 2: // medium
            client.setProperty(Gree.PROPERTY.fanSpeed, Gree.VALUE.fanSpeed.medium)
            break
          case 3: // medium
            client.setProperty(Gree.PROPERTY.fanSpeed, Gree.VALUE.fanSpeed.high)
            break
          default:
            logger.debug('Unexpected value.')
        }
      })

    /// current temperature
    currentTemperatureCharacteristic.onGet(() => {
      const currentTemperature = unitProperties.currentTemperature

      logger.debug('Queried current temperature: ' + currentTemperature)
      return currentTemperature
    })

    /// cooling target - set temperature
    coolingThresholdTemperatureCharacteristic
      .setProps({
        minValue: 16,
        maxValue: 30,
        minStep: 1,
      })
      .onGet(() => {
        const temperature = unitProperties.temperature

        logger.debug('Queried cooling threshold temperature: ' + temperature)
        return temperature
      })
      .onSet(value => {
        logger.debug('Setting cooling threshold temperature: ' + value)
        client.setProperty('temperature', value)
      })

    /// heating target - set temperature
    heatingThresholdTemperatureCharacteristic
      //.setProps({ // This thing doesnt translate well to normal wall ACs
      //	  minValue: 22,
      //	  maxValue: 30,
      //	  minStep: 1
      //	})
      .onGet(() => {
        const temperature = unitProperties.temperature

        logger.debug('Queried heating threshold temperature: ' + temperature)
        return temperature
      })
      .onSet(value => {
        logger.debug('Setting heating threshold temperature: ' + value)
        client.setProperty('temperature', value)
      })

    /// bring up service
    accessory.addService(heaterCoolerService)
    accessory.addService(fanService)

    const fake_mac = parseInt(client.getDeviceId(), 16) + 0x1339 // We change the mac up slightly for the HAP username
    const formatted_mac = fake_mac
      .toString(16)
      .padStart(12, '0')
      .match(/../g)
      .reverse()
      .slice(0, 6)
      .reverse()
      .join(':') // https://stackoverflow.com/questions/17933471/convert-integer-mac-address-to-string-in-javascript
    const pin_code = fake_mac % 99999999 // this is not intended to be secret in this context
    const formatted_pin_code = [
      pin_code.toString().slice(0, 3),
      pin_code.toString().slice(3, 5),
      pin_code.toString().slice(5, 8),
    ].join('-')

    const setupID = hap.Accessory._generateSetupID()

    /// and publish
    accessory.publish({
      username: formatted_mac,
      pincode: formatted_pin_code,
      setupID: setupID,
      port: 47000 + (fake_mac % 6000), // once again - relate to mac in a close-enough to unique way
      category: hap.Categories.HeaterCooler,
    })

    logger.debug('Accessory setup finished!')

    console.log(formatted_pin_code)
    qrcode.generate(makeQrCodeUri(pin_code, setupID))
  })

  process.on('SIGINT', function () {
    logger.fatal('Caught interrupt signal')
    process.exit()
  })
}

function makeQrCodeUri(pin_code, setupID) {
  let payload = 0
  const flag = 2 // IP
  const version = 0
  const categoryId = hap.Categories.HeaterCooler
  const reserved = 0

  payload = payload | (version & 0x7)

  payload = payload << 4
  payload = payload | (reserved & 0xf)

  payload = payload << 8
  payload = payload | (categoryId & 0xff)

  payload = payload << 4
  payload = payload | (flag & 0xf)

  payload = payload << 27
  payload = payload | (pin_code & 0x7fffffff)

  const payloadBase36 = payload.toString(36).toUpperCase().padStart(9, '0')

  return `X-HM://${payloadBase36}${setupID}`
}

if (require.main === module) {
  main()
}
