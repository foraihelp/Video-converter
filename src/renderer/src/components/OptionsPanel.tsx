import type { CodecDefinition, ConvertOptions, OutputContainer } from '../../../shared/types'
import { CONTAINERS, codecsForContainer, audioCodecsForContainer } from '../../../shared/codecDefinitions'

interface Props {
  options: ConvertOptions
  onChange: (options: ConvertOptions) => void
}

const GROUP_ORDER: CodecDefinition['group'][] = [
  'ProRes',
  'DNx',
  'Delivery (H.26x)',
  'Web (VPx)',
  'Legacy / Compatibility',
  'Uncompressed / Lossless'
]

function OptionsPanel({ options, onChange }: Props): React.JSX.Element {
  const update = (patch: Partial<ConvertOptions>): void => onChange({ ...options, ...patch })

  const availableCodecs = codecsForContainer(options.container)
  const availableAudio = audioCodecsForContainer(options.container)
  const selectedCodecDef = availableCodecs.find((c) => c.id === options.codec)
  const selectedAudioDef = availableAudio.find((a) => a.id === options.audioCodec)
  const [crfMin, crfMax] = selectedCodecDef?.crfRange ?? [0, 51]
  const crfValue = options.crf ?? selectedCodecDef?.defaultCrf ?? crfMin
  const bitrateValue = options.bitrateKbps ?? selectedCodecDef?.defaultBitrateKbps ?? 8000
  const audioBitrateValue = options.audioBitrateKbps ?? selectedAudioDef?.defaultBitrateKbps ?? 192

  const handleContainerChange = (container: OutputContainer): void => {
    const validCodecs = codecsForContainer(container)
    const validAudio = audioCodecsForContainer(container)
    const codec = validCodecs.some((c) => c.id === options.codec) ? options.codec : validCodecs[0].id
    const audioCodec = validAudio.some((a) => a.id === options.audioCodec)
      ? options.audioCodec
      : validAudio[0].id
    update({ container, codec, audioCodec })
  }

  return (
    <div className="panel">
      <h2>Output Settings</h2>

      <label className="field">
        <span>Container</span>
        <select value={options.container} onChange={(e) => handleContainerChange(e.target.value as OutputContainer)}>
          {CONTAINERS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Codec</span>
        <select
          value={options.codec}
          onChange={(e) => update({ codec: e.target.value as ConvertOptions['codec'] })}
        >
          {GROUP_ORDER.map((group) => {
            const inGroup = availableCodecs.filter((c) => c.group === group)
            if (inGroup.length === 0) return null
            return (
              <optgroup key={group} label={group}>
                {inGroup.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            )
          })}
        </select>
      </label>
      {selectedCodecDef && <p className="hint">{selectedCodecDef.description}</p>}

      <label className={`field checkbox ${selectedCodecDef?.supportsAlpha ? '' : 'disabled'}`}>
        <input
          type="checkbox"
          checked={options.includeAlpha}
          disabled={!selectedCodecDef?.supportsAlpha}
          onChange={(e) => update({ includeAlpha: e.target.checked })}
        />
        <span>Include alpha channel {!selectedCodecDef?.supportsAlpha && '(not supported by this codec)'}</span>
      </label>

      {selectedCodecDef?.qualityControl === 'crf' && (
        <label className="field">
          <span>Quality (CRF, lower = better): {crfValue}</span>
          <input
            type="range"
            min={crfMin}
            max={crfMax}
            value={crfValue}
            onChange={(e) => update({ crf: Number(e.target.value) })}
          />
        </label>
      )}

      {selectedCodecDef?.qualityControl === 'bitrate' && (
        <label className="field">
          <span>Bitrate (kbps)</span>
          <input
            type="number"
            min={500}
            step={500}
            value={bitrateValue}
            onChange={(e) => update({ bitrateKbps: Number(e.target.value) })}
          />
        </label>
      )}

      <hr />

      <label className="field">
        <span>Audio codec</span>
        <select
          value={options.audioCodec}
          onChange={(e) => update({ audioCodec: e.target.value as ConvertOptions['audioCodec'] })}
        >
          {availableAudio.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      {selectedAudioDef?.description && <p className="hint">{selectedAudioDef.description}</p>}

      {selectedAudioDef?.hasBitrate && (
        <label className="field">
          <span>Audio bitrate (kbps)</span>
          <input
            type="number"
            min={64}
            step={32}
            value={audioBitrateValue}
            onChange={(e) => update({ audioBitrateKbps: Number(e.target.value) })}
          />
        </label>
      )}

      <label className="field checkbox">
        <input
          type="checkbox"
          checked={options.preserveMetadata}
          onChange={(e) => update({ preserveMetadata: e.target.checked })}
        />
        <span>Preserve metadata</span>
      </label>

      <label className={`field checkbox ${options.container === 'mov' ? '' : 'disabled'}`}>
        <input
          type="checkbox"
          checked={options.preserveTimecode}
          disabled={options.container !== 'mov'}
          onChange={(e) => update({ preserveTimecode: e.target.checked })}
        />
        <span>
          Preserve timecode track {options.container !== 'mov' && '(QuickTime-only)'}
        </span>
      </label>
    </div>
  )
}

export default OptionsPanel
