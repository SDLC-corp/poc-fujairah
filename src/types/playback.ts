/** One recorded fix from the day's history file. */
export interface PlaybackSample {
  /** ISO 8601 timestamp. */
  at: string
  lon: number
  lat: number
  speedKn: number
  headingDeg: number
  status: 'anchored' | 'underway' | string
}

export interface PlaybackVessel {
  id: string
  name: string
  imo: string
  mmsi: string
  type: string
  flag: string
  lengthM: number
  beamM: number
  draftM: number
  /** Whether the day's movement is an arrival or a sailing. */
  movement: 'arrival' | 'departure'
  /** Anchorage area the movement is to or from. */
  area: string
  track: PlaybackSample[]
}

/** public/data/playback.json — one day of position history. */
export interface PlaybackData {
  day: string
  from: string
  to: string
  intervalMinutes: number
  samples: number
  vessels: PlaybackVessel[]
}
