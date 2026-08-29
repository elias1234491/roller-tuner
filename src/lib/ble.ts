// Web-Bluetooth-Transport: verbinden, Merkmale finden, Bytes senden/empfangen.
// Funktioniert nur in Chrome/Edge (PC oder Android). Läuft alles lokal.

/** Was die Protokoll-Schicht braucht: Bytes rein, Bytes raus. */
export interface Transport {
  readonly name: string
  send(data: Uint8Array): Promise<void>
  /** Rohe Notification-Häppchen abonnieren. Rückgabe: Abmelde-Funktion. */
  subscribe(handler: (chunk: Uint8Array) => void): () => void
  disconnect(): void
  readonly connected: boolean
}

export interface BleLink {
  name: string
  serviceUuid: string
  writeUuid: string
  notifyUuid: string
  transport: Transport
}

// Bekannte GATT-Dienste, die wir anfragen dürfen müssen (optionalServices).
export const KNOWN_SERVICES: string[] = [
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART (Xiaomi / ältere Ninebot)
  '6e400001-0000-0000-006e-696e65626f74', // Ninebot Gen3 ("ninebot" in ASCII)
  '0000fe95-0000-1000-8000-00805f9b34fb', // Xiaomi 0xFE95
]

function isSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

function isNinebotService(uuid: string): boolean {
  return uuid.toLowerCase().includes('696e65626f74')
}

export async function connectBle(): Promise<BleLink> {
  if (!isSupported()) {
    throw new Error('Dieser Browser kann kein Web Bluetooth. Nutze Chrome/Edge am PC oder auf Android.')
  }

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: KNOWN_SERVICES,
  })
  if (!device.gatt) throw new Error('Gerät bietet kein GATT an.')

  const server = await device.gatt.connect()
  const services = await server.getPrimaryServices()

  // Alle Merkmale einsammeln. Zum Schreiben den Ninebot-Dienst bevorzugen, und
  // auf ALLE Melde-Merkmale hören (wir wissen vorab nicht, auf welchem der
  // Roller antwortet).
  const found: { svc: BluetoothRemoteGATTService; ch: BluetoothRemoteGATTCharacteristic }[] = []
  for (const svc of services) {
    const chars = await svc.getCharacteristics()
    for (const ch of chars) found.push({ svc, ch })
  }

  const writeCands = found.filter((e) => e.ch.properties.writeWithoutResponse || e.ch.properties.write)
  const writeEntry = writeCands.find((e) => isNinebotService(e.svc.uuid)) ?? writeCands[0]
  const notifyChars = found.filter((e) => e.ch.properties.notify || e.ch.properties.indicate).map((e) => e.ch)

  if (!writeEntry || notifyChars.length === 0) {
    server.disconnect()
    throw new Error('Kein passendes Schreib-/Melde-Merkmal gefunden. Vermutlich der falsche Roller.')
  }

  const transport = new WebBleTransport(device, writeEntry.ch, notifyChars)
  await transport.start()

  return {
    name: device.name ?? 'Unbekannter Roller',
    serviceUuid: writeEntry.svc.uuid,
    writeUuid: writeEntry.ch.uuid,
    notifyUuid: notifyChars.map((c) => c.uuid.slice(0, 8)).join(', '),
    transport,
  }
}

class WebBleTransport implements Transport {
  readonly name: string
  connected = true
  private handlers = new Set<(chunk: Uint8Array) => void>()
  private writeQueue: Promise<void> = Promise.resolve()
  private readonly device: BluetoothDevice
  private readonly writeChar: BluetoothRemoteGATTCharacteristic
  private readonly notifyChars: BluetoothRemoteGATTCharacteristic[]

  constructor(
    device: BluetoothDevice,
    writeChar: BluetoothRemoteGATTCharacteristic,
    notifyChars: BluetoothRemoteGATTCharacteristic[],
  ) {
    this.device = device
    this.writeChar = writeChar
    this.notifyChars = notifyChars
    this.name = device.name ?? 'Roller'
  }

  async start(): Promise<void> {
    for (const ch of this.notifyChars) {
      try {
        await ch.startNotifications()
        ch.addEventListener('characteristicvaluechanged', this.onValue)
      } catch {
        // dieses Merkmal kann keine Notifications — überspringen
      }
    }
    this.device.addEventListener('gattserverdisconnected', this.onDisconnected)
  }

  private onValue = (event: Event): void => {
    const ch = event.target as BluetoothRemoteGATTCharacteristic
    const dv = ch.value
    if (!dv) return
    const bytes = new Uint8Array(dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength))
    for (const h of this.handlers) h(bytes)
  }

  private onDisconnected = (): void => {
    this.connected = false
  }

  send(data: Uint8Array): Promise<void> {
    // Schreibvorgänge streng nacheinander (BLE verträgt kein Überlappen).
    this.writeQueue = this.writeQueue.then(() => this.writeChunks(data))
    return this.writeQueue
  }

  private async writeChunks(data: Uint8Array): Promise<void> {
    const MTU = 20 // sicherer Wert; viele Roller-Merkmale nehmen nicht mehr
    for (let i = 0; i < data.length; i += MTU) {
      const slice = data.slice(i, i + MTU)
      if (this.writeChar.properties.writeWithoutResponse) {
        await this.writeChar.writeValueWithoutResponse(slice)
      } else {
        await this.writeChar.writeValue(slice)
      }
    }
  }

  subscribe(handler: (chunk: Uint8Array) => void): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  disconnect(): void {
    try {
      for (const ch of this.notifyChars) ch.removeEventListener('characteristicvaluechanged', this.onValue)
      this.device.removeEventListener('gattserverdisconnected', this.onDisconnected)
      this.device.gatt?.disconnect()
    } catch {
      // egal — wir trennen sowieso
    }
    this.connected = false
    this.handlers.clear()
  }
}

// ---- Diagnose: alle Schreib-Kanäle einzeln ansprechen, überall lauschen ----

export interface WriteTarget {
  uuid: string
  ch: BluetoothRemoteGATTCharacteristic
}

export interface BleDiag {
  name: string
  writeChars: WriteTarget[]
  /** Menschenlesbarer GATT-Aufbau: Dienst / Merkmal [Eigenschaften] ✓sub. */
  report: string[]
  subscribe(handler: (chunk: Uint8Array, fromUuid: string) => void): () => void
  writeTo(target: WriteTarget, data: Uint8Array): Promise<void>
  disconnect(): void
}

export async function connectBleDiag(): Promise<BleDiag> {
  if (!isSupported()) throw new Error('Dieser Browser kann kein Web Bluetooth.')
  const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: KNOWN_SERVICES })
  if (!device.gatt) throw new Error('Gerät bietet kein GATT an.')
  const server = await device.gatt.connect()
  const services = await server.getPrimaryServices()

  const all: { svc: BluetoothRemoteGATTService; ch: BluetoothRemoteGATTCharacteristic }[] = []
  for (const svc of services) {
    for (const ch of await svc.getCharacteristics()) all.push({ svc, ch })
  }
  const writeChars: WriteTarget[] = all
    .filter((e) => e.ch.properties.writeWithoutResponse || e.ch.properties.write)
    .map((e) => ({ uuid: e.ch.uuid, ch: e.ch }))
  const notifyChars = all.filter((e) => e.ch.properties.notify || e.ch.properties.indicate).map((e) => e.ch)

  const handlers = new Set<(chunk: Uint8Array, fromUuid: string) => void>()
  const onValue = (event: Event): void => {
    const ch = event.target as BluetoothRemoteGATTCharacteristic
    const dv = ch.value
    if (!dv) return
    const bytes = new Uint8Array(dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength))
    for (const h of handlers) h(bytes, ch.uuid)
  }
  const subscribed = new Set<string>()
  for (const ch of notifyChars) {
    try {
      await ch.startNotifications()
      ch.addEventListener('characteristicvaluechanged', onValue)
      subscribed.add(ch.uuid)
    } catch {
      // dieses Merkmal kann keine Notifications — überspringen
    }
  }

  const shortU = (u: string): string => (u.length >= 20 ? u.slice(0, 8) + '…' + u.slice(-12) : u)
  const report = all.map((e) => {
    const props = [
      e.ch.properties.writeWithoutResponse ? 'wNR' : '',
      e.ch.properties.write ? 'w' : '',
      e.ch.properties.notify ? 'notify' : '',
      e.ch.properties.indicate ? 'ind' : '',
    ]
      .filter(Boolean)
      .join(',')
    return `${shortU(e.svc.uuid)} / ${shortU(e.ch.uuid)} [${props}]${subscribed.has(e.ch.uuid) ? ' ✓sub' : ''}`
  })

  return {
    name: device.name ?? 'Roller',
    writeChars,
    report,
    subscribe(handler) {
      handlers.add(handler)
      return () => {
        handlers.delete(handler)
      }
    },
    async writeTo(target, data) {
      const MTU = 20
      for (let i = 0; i < data.length; i += MTU) {
        const slice = data.slice(i, i + MTU)
        if (target.ch.properties.writeWithoutResponse) await target.ch.writeValueWithoutResponse(slice)
        else await target.ch.writeValue(slice)
      }
    },
    disconnect() {
      try {
        for (const ch of notifyChars) ch.removeEventListener('characteristicvaluechanged', onValue)
        device.gatt?.disconnect()
      } catch {
        // egal
      }
      handlers.clear()
    },
  }
}
