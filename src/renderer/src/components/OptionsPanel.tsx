import type { CodecDefinition, ConvertOptions, AudioMode } from '../../../shared/types'

interface Props {
  options: ConvertOptions
  onChange: (options: ConvertOptions) => void
  codecs: CodecDefinition[]
  selectedCodecSupportsAlpha: boolean
  selectedCodecQualityControl: 'crf' | 'bitrate' | null
}

const GROUP_ORDER: CodecDefinition['group'][] = [
  'ProRes',
  'DNx',
  'Delivery (H.26x)',
  'Legacy / Compatibility',
  'Uncompressed / Lossless'
]

function OptionsPanel({
  options,
  onChange,
  codecs,
  selectedCodecSupportsAlpha,
  selectedCodecQualityControl
}: Props): React.JSX.Element {
  const update = (patch: Partial<ConvertOptions>): void => onChange({ ...options, ...patch })
  const selectedDef = codecs.find((c) => c.id === options.codec)

  return (
    <div className="panel">
      <h2>Output Settings</h2>

      <label className="field">
        <span>Codec</span>
        <select
          value={options.codec}
          onChange={(e) => update({ codec: e.target.value as ConvertOptions['codec'] })}
        >
          {GROUP_ORDER.map((group) => (
            <optgroup key={group} label={group}>
              {codecs
                .filter((c) => c.group === group)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      {selectedDef && <p className="hint">{selectedDef.description}</p>}

      <label className={`field checkbox ${selectedCodecSupportsAlpha ? '' : 'disabled'}`}>
        <input
          type="checkbox"
          checked={options.includeAlpha}
          disabled={!selectedCodecSupportsAlpha}
          onChange={(e) => update({ includeAlpha: e.target.checked })}
        />
        <span>Include alpha channel {!selectedCodecSupportsAlpha && '(not supported by this codec)'}</span>
      </label>

      {selectedCodecQualityControl === 'crf' && (
        <label className="field">
          <span>Quality (CRF, lower = better): {options.crf}</span>
          <input
            type="range"
            min={0}
            max={51}
            value={options.crf ?? 18}
            onChange={(e) => update({ crf: Number(e.target.value) })}
          />
        </label>
      )}

      {selectedCodecQualityControl === 'bitrate' && (
        <label className="field">
          <span>Bitrate (kbps)</span>
          <input
            type="number"
            min={500}
            step={500}
            value={options.bitrateKbps ?? 8000}
            onChange={(e) => update({ bitrateKbps: Number(e.target.value) })}
          />
        </label>
      )}

      <hr />

      <label className="field">
        <span>Audio</span>
        <select
          value={options.audioMode}
          onChange={(e) => update({ audioMode: e.target.value as AudioMode })}
        >
          <option value="copy">Copy (no re-encode, lossless)</option>
          <option value="pcm_s16le">Uncompressed PCM 16-bit</option>
          <option value="pcm_s24le">Uncompressed PCM 24-bit</option>
          <option value="aac">AAC 320kbps</option>
          <option value="none">No audio</option>
        </select>
      </label>

      <label className="field checkbox">
        <input
          type="checkbox"
          checked={options.preserveMetadata}
          onChange={(e) => update({ preserveMetadata: e.target.checked })}
        />
        <span>Preserve metadata</span>
      </label>

      <label className="field checkbox">
        <input
          type="checkbox"
          checked={options.preserveTimecode}
          onChange={(e) => update({ preserveTimecode: e.target.checked })}
        />
        <span>Preserve timecode track</span>
      </label>
    </div>
  )
}

export default OptionsPanel
