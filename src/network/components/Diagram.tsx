import type { PrimaryPatternId } from '../data/types';

interface Props {
  pattern: PrimaryPatternId;
  multihome?: boolean;
  clientsOutside?: boolean;
  vlanId?: string;
  subnet?: string;
  linuxBridgeName?: string;
  physicalNetworkName?: string;
  secondaryNetworkName?: string;
}

interface Spec {
  client: [string, string];
  middle: [string, string];
  middleTone: 'service' | 'overlay' | 'physical';
  /** クラスタ境界の左端（クライアントや物理スイッチがクラスタの内か外か） */
  clusterLeft: number;
  sw: [string, string];
  swTag?: { text: string; warn: boolean };
  podIp?: string;
  guestIp: string;
  reachable: boolean;
  nat: boolean;
  path: string;
}

function hostIp(subnet: string | undefined): string {
  const m = subnet?.match(/^(\d+\.\d+\.\d+)\.\d+\/\d+$/);
  return m ? `${m[1]}.10` : '192.168.100.10';
}

function specFor(p: Props): Spec {
  const vlan = p.vlanId || '100';
  switch (p.pattern) {
    case 'A':
      return {
        client: ['クライアント', '名前 / LB で接続'],
        middle: ['Service', 'Route / LB'],
        middleTone: 'service',
        clusterLeft: 178,
        sw: ['OVN', 'Pod Network'],
        podIp: 'Pod IP（移行で変わる）',
        guestIp: '10.0.2.2（全 VM 共通）',
        reachable: false,
        nat: true,
        path: 'クライアント → Service（Route / LB）→ Pod IP → NAT → ゲスト（10.0.2.2）',
      };
    case 'B':
      return {
        client: ['接続相手の VM', '同じ UDN に参加'],
        middle: ['UDN Layer2', 'オーバーレイ'],
        middleTone: 'overlay',
        clusterLeft: 4,
        sw: ['OVN', 'Logical Switch'],
        guestIp: `${hostIp(p.subnet)}（不変）`,
        reachable: true,
        nat: false,
        path: `接続相手の VM → UDN Layer2（Geneve オーバーレイ）→ ゲスト（${hostIp(p.subnet)}）。NAT なし。既定ではクラスタ外から直接届かない`,
      };
    case 'C':
      return {
        client: ['クライアント', p.clientsOutside === false ? '接続相手' : 'クラスタ外に残る'],
        middle: ['物理スイッチ', `VLAN ${vlan}`],
        middleTone: 'physical',
        clusterLeft: 368,
        sw: ['OVS ブリッジ', `mapping ${p.physicalNetworkName || `vlan${vlan}`}`],
        swTag: { text: 'OVN 管理下', warn: false },
        guestIp: '現行 IP のまま',
        reachable: true,
        nat: false,
        path: `クライアント → 物理スイッチ（VLAN ${vlan}）→ ノードの OVS ブリッジ（bridge-mapping）→ Localnet → ゲスト（現行 IP）。NAT なし`,
      };
    case 'D':
      return {
        client: ['クライアント', p.clientsOutside === false ? '接続相手' : 'クラスタ外に残る'],
        middle: ['物理スイッチ', `VLAN ${vlan}`],
        middleTone: 'physical',
        clusterLeft: 368,
        sw: ['Linux Bridge', p.linuxBridgeName || `br-vlan${vlan}`],
        swTag: { text: 'OVN バイパス', warn: true },
        guestIp: '現行 IP のまま',
        reachable: true,
        nat: false,
        path: `クライアント → 物理スイッチ（VLAN ${vlan}）→ ノードの Linux Bridge（OVN を通らない）→ ゲスト（現行 IP）。NAT なし`,
      };
  }
}

const tones = {
  service: { fill: '#f1f5f9', stroke: '#64748b' },
  overlay: { fill: '#eef2ff', stroke: '#6366f1' },
  physical: { fill: '#f5f5f4', stroke: '#57534e' },
};

const Y = 160; // 経路の高さ

/** パターン別の簡易構成図（SVG） */
export function Diagram(props: Props) {
  const s = specFor(props);
  const tone = tones[s.middleTone];
  const ok = s.reachable;
  const guestH = props.multihome ? 112 : 90;
  const guestY = 128;

  return (
    <figure className="w-full">
      <svg viewBox="0 0 800 296" className="mx-auto h-auto w-full max-w-3xl" role="img" aria-label={`構成図: ${s.path}`} fontFamily="inherit">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#475569" />
          </marker>
        </defs>

        {/* クラスタ境界 */}
        <rect x={s.clusterLeft} y="6" width={796 - s.clusterLeft} height="286" rx="16" fill="none" stroke="#cbd5e1" strokeDasharray="6 5" />
        <text x={s.clusterLeft + 14} y="28" fontSize="13" fill="#64748b">
          OpenShift クラスタ
        </text>

        {/* クライアント */}
        <rect x="14" y={Y - 42} width="150" height="84" rx="10" fill="white" stroke="#94a3b8" strokeWidth="1.5" />
        <text x="89" y={Y - 6} textAnchor="middle" fontSize="16" fontWeight="600" fill="#0f172a">
          {s.client[0]}
        </text>
        <text x="89" y={Y + 18} textAnchor="middle" fontSize="13" fill="#475569">
          {s.client[1]}
        </text>

        {/* 中間（Service / オーバーレイ / 物理スイッチ） */}
        <rect
          x="200"
          y={Y - 42}
          width="140"
          height="84"
          rx="10"
          fill={tone.fill}
          stroke={tone.stroke}
          strokeWidth="1.5"
          strokeDasharray={s.middleTone === 'overlay' ? '5 4' : undefined}
        />
        <text x="270" y={Y - 6} textAnchor="middle" fontSize="16" fontWeight="600" fill="#0f172a">
          {s.middle[0]}
        </text>
        <text x="270" y={Y + 18} textAnchor="middle" fontSize="13" fill="#475569">
          {s.middle[1]}
        </text>

        {/* ノード */}
        <rect x="382" y="42" width="404" height="240" rx="12" fill="white" stroke="#475569" strokeWidth="1.5" />
        <text x="398" y="66" fontSize="14" fontWeight="600" fill="#334155">
          ワーカーノード
        </text>

        {/* ノード内のスイッチ */}
        <rect x="396" y={Y - 36} width="126" height="72" rx="8" fill="#f8fafc" stroke="#64748b" />
        <text x="459" y={Y - 5} textAnchor="middle" fontSize="15" fontWeight="600" fill="#0f172a">
          {s.sw[0]}
        </text>
        <text x="459" y={Y + 17} textAnchor="middle" fontSize="12" fill="#475569">
          {s.sw[1]}
        </text>
        {s.swTag && (
          <g>
            <rect x="409" y={Y + 46} width="100" height="24" rx="12" fill={s.swTag.warn ? '#fef3c7' : '#e0f2fe'} />
            <text x="459" y={Y + 63} textAnchor="middle" fontSize="12" fill="#1e293b">
              {s.swTag.text}
            </text>
          </g>
        )}

        {/* virt-launcher Pod */}
        <rect x="580" y="78" width="194" height="194" rx="10" fill="#f8fafc" stroke="#94a3b8" strokeDasharray="4 3" />
        <text x="592" y="98" fontSize="12" fill="#475569">
          virt-launcher Pod
        </text>
        {s.podIp && (
          <text x="592" y="116" fontSize="12" fontWeight="600" fill="#b45309">
            {s.podIp}
          </text>
        )}

        {/* ゲスト OS（宛先になる / ならないを色と記号とラベルで示す） */}
        <rect x="598" y={guestY} width="160" height={guestH} rx="8" fill={ok ? '#ecfdf5' : '#fffbeb'} stroke={ok ? '#059669' : '#d97706'} strokeWidth="2" />
        <text x="678" y={guestY + 24} textAnchor="middle" fontSize="15" fontWeight="600" fill="#0f172a">
          ゲスト OS
        </text>
        <text x="678" y={guestY + 46} textAnchor="middle" fontSize="12" fill="#334155">
          {s.guestIp}
        </text>
        <text x="678" y={guestY + 72} textAnchor="middle" fontSize="14" fontWeight="700" fill={ok ? '#047857' : '#b45309'}>
          {ok ? '✓ 宛先になる' : '✕ 宛先にならない'}
        </text>
        {props.multihome && (
          <text x="678" y={guestY + 97} textAnchor="middle" fontSize="12" fill="#4338ca">
            ＋NIC2: {props.secondaryNetworkName || 'vlan200'}
          </text>
        )}

        {/* 経路 */}
        <line x1="164" y1={Y} x2="198" y2={Y} stroke="#475569" strokeWidth="2" markerEnd="url(#arrow)" />
        <line x1="340" y1={Y} x2="394" y2={Y} stroke="#475569" strokeWidth="2" markerEnd="url(#arrow)" />
        <line x1="522" y1={Y} x2="596" y2={Y} stroke="#475569" strokeWidth="2" markerEnd="url(#arrow)" />
        {s.nat ? (
          <g>
            <rect x="530" y={Y - 32} width="44" height="22" rx="11" fill="#d97706" />
            <text x="552" y={Y - 16} textAnchor="middle" fontSize="12" fontWeight="700" fill="white">
              NAT
            </text>
          </g>
        ) : (
          <g>
            <rect x="526" y={Y - 32} width="52" height="22" rx="11" fill="#d1fae5" />
            <text x="552" y={Y - 16} textAnchor="middle" fontSize="11" fontWeight="600" fill="#065f46">
              NAT なし
            </text>
          </g>
        )}
      </svg>
      <figcaption className="mx-auto mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
        <span className="font-medium text-slate-700">経路:</span> {s.path}
      </figcaption>
    </figure>
  );
}
