import type { SizingResult } from '../domain/result';
import { DISCLAIMER, PRODUCT } from '../domain/sources';
import { PATH_LABELS, PLACEMENT_LABELS, type Qty, type RoleKey, type SizingInput } from '../domain/types';
import { AssumptionList, Legend, OpenItemsList, SectionView, SourcesList, SummaryTable } from './ResultParts';
import type { SimpleInput } from '../domain/simple';
import { SIMPLE_GROUP_IDS, type SimpleView } from '../domain/simpleView';
import { SimpleTables, SimpleVerdict, simpleOpenItems } from './SimpleResults';
import type { NetworkState } from '../domain/networkLink';
import { NetworkReportSection } from './NetworkPanels';

const v = (raw: string) => (raw.trim() === '' ? '未入力' : raw);
const q = (x: Qty<string>) => (x.raw.trim() === '' ? '未入力' : `${x.raw} ${x.unit}`);
const tri = (t: string) => (t === 'yes' ? 'はい' : t === 'no' ? 'いいえ' : '未確認');

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const ROLE_LABEL: Record<RoleKey, string> = { controlPlane: 'コントロールプレーン', compute: 'コンピュート', infra: 'インフラ' };

export function PrintReport({ input, result, simple, network }: { input: SizingInput; result: SizingResult; simple?: { input: SimpleInput; view: SimpleView }; network?: NetworkState }) {
  if (simple) return <SimpleReport input={input} result={result} simple={simple} network={network} />;
  const backendName = (id: string) => input.backends.find((b) => b.id === id)?.name || '未指定';
  return (
    <article className="report" lang="ja">
      <header className="report-head">
        <h1>OpenShift サイジングレポート（詳細版）</h1>
        <table className="meta">
          <tbody>
            <tr>
              <th scope="row">案件名</th>
              <td>{input.cluster.projectName || '（未入力）'}</td>
            </tr>
            <tr>
              <th scope="row">計算日時</th>
              <td>{fmtDate(result.calculatedAt)}</td>
            </tr>
            <tr>
              <th scope="row">製品バージョン</th>
              <td>
                {PRODUCT.ocp}／{PRODUCT.virt}
              </td>
            </tr>
            <tr>
              <th scope="row">配置プラットフォーム</th>
              <td>
                {input.cluster.platform}
                {input.cluster.platformNote ? `（${input.cluster.platformNote}）` : ''}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="disclaimer">
          <strong>{DISCLAIMER.title}：</strong>
          {DISCLAIMER.text}
        </p>
        {input.isSample && <p className="sample-note">※ 入力値はサンプル値です。公式値ではありません。</p>}
        {result.inputErrorCount > 0 && <p className="sample-note">※ 入力エラーが {result.inputErrorCount} 件あります。該当項目は未算出として扱っています。</p>}
        <p className="scope-note">
          適用範囲：コントロールプレーン・コンピュート・インフラを分けた通常のマルチノード構成。SNO、コンパクトクラスタ、Hosted Control Planes、ODF 自体の構成設計は適用範囲外です。空欄の入力は 0 や既定値に置き換えず、「未算出」「未確認」と表示しています。
        </p>
      </header>

      <section>
        <h2>1. ノード別サマリー</h2>
        <SummaryTable result={result} split />
        <Legend />
      </section>

      {network && <NetworkReportSection network={network} heading="2. ネットワーク構成（診断結果）" />}
      <section>
        <h2>3. 入力と前提</h2>
        <h3>3.1 ゲスト VM プロファイル（ゲスト VM のスペック）</h3>
        <table className="data input-table">
          <colgroup>
            {[12, 10, 13, 7, 7, 15, 22, 14].map((w, i) => (
              <col key={i} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">プロファイル</th>
              <th scope="col">定義／同時稼働</th>
              <th scope="col">vCPU・CPU</th>
              <th scope="col">RAM</th>
              <th scope="col">ディスク</th>
              <th scope="col">デバイス</th>
              <th scope="col">ストレージ・性能</th>
              <th scope="col">通信</th>
            </tr>
          </thead>
          <tbody>
            {input.vms.map((x, i) => (
              <tr key={x.id}>
                <th scope="row">{x.name || `プロファイル ${i + 1}`}</th>
                <td>
                  {v(x.definedCount)} ／ {x.runningLinked ? `${v(x.definedCount)}（定義台数と同数・初期値）` : v(x.runningCount)}
                </td>
                <td>
                  {v(x.vcpu)} vCPU
                  <br />
                  {x.cpuMode === 'dedicated' ? '専用 CPU' : `共有 CPU（比率 ${v(x.allocationRatio)}）`}
                  <br />
                  ピーク {v(x.peakCpu)}
                  {x.peakCpuMode === 'percent' ? ' %' : ' コア'}
                  {x.extraCpu ? `、追加 ${x.extraCpu} コア` : ''}
                </td>
                <td>{q(x.ram)}</td>
                <td>{q(x.disk)}</td>
                <td>
                  グラフィックス {v(x.graphics)}、SR-IOV {v(x.sriov)}、GPU {v(x.gpu)}
                  <br />
                  SEV {x.sev ? '有効' : '無効'}、TPM {x.tpm ? '有効' : '無効'}
                </td>
                <td>
                  {backendName(x.backendId)}（RWX {tri(x.rwx)}）
                  <br />
                  IOPS 読 {v(x.readIops)}／書 {v(x.writeIops)}
                  <br />
                  読 {q(x.readTp)}／書 {q(x.writeTp)}
                  <br />
                  許容 {v(x.latencyMs)} ms
                </td>
                <td>
                  送 {q(x.txBw)}／受 {q(x.rxBw)}
                  <br />
                  移行対象 {x.migratable ? 'はい' : 'いいえ'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>3.2 候補ノード（OpenShift ノードのスペック、1 台あたり）</h3>
        <table className="data input-table">
          <thead>
            <tr>
              <th scope="col">ロール</th>
              <th scope="col">台数</th>
              <th scope="col">CPU</th>
              <th scope="col">メモリ</th>
              <th scope="col">ディスク／IOPS</th>
              <th scope="col">NIC</th>
              <th scope="col">Allocatable・予約</th>
              <th scope="col">常駐 Pod・Pod 枠</th>
              <th scope="col">利用不可</th>
            </tr>
          </thead>
          <tbody>
            {(['controlPlane', 'compute', 'infra'] as RoleKey[])
              .filter((k) => k !== 'infra' || input.cluster.infraEnabled)
              .map((k) => {
                const r = input.roles[k];
                return (
                  <tr key={k}>
                    <th scope="row">{ROLE_LABEL[k]}</th>
                    <td>{v(r.count)}</td>
                    <td>{v(r.cpu)} vCPU</td>
                    <td>{q(r.ram)}</td>
                    <td>
                      {q(r.disk)}／{v(r.iops)}
                      <br />
                      消費見積 {q(r.localEstimate)}
                    </td>
                    <td>{q(r.nic)}</td>
                    <td>
                      {k === 'controlPlane' ? (
                        '—'
                      ) : (
                        <>
                          Allocatable {v(r.allocCpu)} コア／{q(r.allocMem)}
                          <br />
                          予約 {r.sysResCpu || r.sysResMem.raw ? `${v(r.sysResCpu)} コア／${q(r.sysResMem)}` : r.autoSysReserved ? '公式の自動計算' : '未入力'}
                          <br />
                          Eviction {q(r.evictionMem)}
                        </>
                      )}
                    </td>
                    <td>
                      {k === 'compute' ? (
                        <>
                          {v(r.residentCpu)} コア／{q(r.residentMem)}
                          {r.residentIncludesVirt ? '（Virtualization 分を含む）' : ''}
                          <br />
                          Pod 枠 {v(r.podSlots)}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{v(r.unavailable)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        <p className="small">
          Namespace 数 {v(input.cluster.namespaces)}。Operator・更新負荷のメモ：{input.cluster.operatorNotes || 'なし'}。コントロールプレーン計測値：CPU {v(input.cpMetrics.cpuUtil)} %、メモリ {v(input.cpMetrics.memUtil)} %、p99 fsync{' '}
          {v(input.cpMetrics.fsyncMs)} ms、p99 RTT {v(input.cpMetrics.rttMs)} ms。
        </p>

        <h3>3.3 インフラサービス</h3>
        <table className="data input-table">
          <thead>
            <tr>
              <th scope="col">サービス</th>
              <th scope="col">配置先</th>
              <th scope="col">レプリカ</th>
              <th scope="col">CPU／メモリ（1 レプリカ）</th>
              <th scope="col">保存量・帯域</th>
            </tr>
          </thead>
          <tbody>
            {input.services.map((s) => (
              <tr key={s.id}>
                <th scope="row">{s.name}</th>
                <td>{PLACEMENT_LABELS[s.placement]}</td>
                <td>{v(s.replicas)}</td>
                <td>
                  {v(s.cpu)} コア／{q(s.mem)}
                </td>
                <td>
                  {s.kind === 'monitoring' && (
                    <>
                      1 日あたり {q(s.perReplicaPerDay)}、保持 {s.retentionDays || '既定 15'} 日、時系列 {v(s.timeSeries)}、間隔 {v(s.scrapeSec)} 秒、PV 空き {v(s.pvFreePct)} %
                    </>
                  )}
                  {(s.kind === 'registry' || s.kind === 'logging' || s.kind === 'other') && (
                    <>
                      実効保存量 {q(s.capacity)}、PV 空き {v(s.pvFreePct)} %
                    </>
                  )}
                  {s.kind === 'ingress' && (
                    <>
                      ピーク {q(s.peakBw)}
                      {s.requestRate ? `、${s.requestRate}` : ''}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>3.4 可用性・移行、ネットワーク、ストレージ</h3>
        <p className="small">
          同時 drain {v(input.availability.computeDrain)} 台、同時移行 {input.availability.parallelMigrations || '既定 5'} 件／ノードごと {input.availability.parallelPerNode || '既定 2'} 件、目標時間{' '}
          {v(input.availability.migrationTargetSec)} 秒、メモリ更新速度 {q(input.availability.dirtyRate)}、実測転送量 {q(input.availability.measuredTransfer)}、CPU 互換性 {tri(input.availability.cpuModelCompatible)}、配置制約{' '}
          {input.availability.placementConstraints ? `あり（${input.availability.placementNote || 'メモなし'}）` : 'なし'}。
        </p>
        <table className="data input-table">
          <thead>
            <tr>
              <th scope="col">経路</th>
              <th scope="col">NIC</th>
              <th scope="col">クラスタ 送／受</th>
              <th scope="col">ノードあたり 送／受</th>
            </tr>
          </thead>
          <tbody>
            {input.paths.map((p) => (
              <tr key={p.key}>
                <th scope="row">{PATH_LABELS[p.key]}</th>
                <td>
                  {p.nic || '未割り当て'}（{p.dedicated ? '専用' : '共有'}）
                </td>
                <td>
                  {q(p.clusterTx)}／{q(p.clusterRx)}
                </td>
                <td>
                  {q(p.perNodeTx)}／{q(p.perNodeRx)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {input.backends.length > 0 && (
          <table className="data input-table">
            <thead>
              <tr>
                <th scope="col">ストレージ</th>
                <th scope="col">係数／増加／空き</th>
                <th scope="col">IOPS 読／書</th>
                <th scope="col">スループット 読／書</th>
                <th scope="col">実測レイテンシ</th>
              </tr>
            </thead>
            <tbody>
              {input.backends.map((b) => (
                <tr key={b.id}>
                  <th scope="row">{b.name || '（名称未入力）'}</th>
                  <td>
                    × {v(b.factor)}／{q(b.snapshotGrowth)}／{v(b.freePct)} %
                  </td>
                  <td>
                    {v(b.specReadIops)}／{v(b.specWriteIops)}
                  </td>
                  <td>
                    {q(b.specReadTp)}／{q(b.specWriteTp)}
                  </td>
                  <td>{v(b.measuredLatencyMs)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3>3.5 前提と仮定</h3>
        <AssumptionList result={result} />
      </section>

      <section>
        <h2>4. 容量・性能・帯域の内訳</h2>
        {result.groups.map((g) => (
          <div key={g.id} className="report-group">
            <h3>{g.title}</h3>
            {g.sections.map((s) => (
              <SectionView key={s.id} section={s} print />
            ))}
          </div>
        ))}
      </section>

      <section>
        <h2>5. 未確認事項・要対応（{result.openItems.length} 件）</h2>
        <OpenItemsList result={result} />
      </section>

      <section>
        <h2>6. 出典一覧</h2>
        <p className="small">すべて Red Hat の 4.22 版公式資料です。章節番号は各資料ページ内の番号です。</p>
        <SourcesList result={result} />
      </section>
    </article>
  );
}

function ReportHead({ input, result, title }: { input: SizingInput; result: SizingResult; title: string }) {
  return (
    <header className="report-head">
      <h1>{title}</h1>
      <table className="meta">
        <tbody>
          <tr>
            <th scope="row">案件名</th>
            <td>{input.cluster.projectName || '（未入力）'}</td>
          </tr>
          <tr>
            <th scope="row">計算日時</th>
            <td>{fmtDate(result.calculatedAt)}</td>
          </tr>
          <tr>
            <th scope="row">製品バージョン</th>
            <td>
              {PRODUCT.ocp}／{PRODUCT.virt}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="disclaimer">
        <strong>{DISCLAIMER.title}：</strong>
        {DISCLAIMER.text}
      </p>
      {input.isSample && <p className="sample-note">※ 入力値はサンプル値です。公式値ではありません。</p>}
      {result.inputErrorCount > 0 && <p className="sample-note">※ 入力エラーが {result.inputErrorCount} 件あります。該当項目は未算出として扱っています。</p>}
    </header>
  );
}

function SimpleReport({ input, result, simple, network }: { input: SizingInput; result: SizingResult; simple: { input: SimpleInput; view: SimpleView }; network?: NetworkState }) {
  const s = simple.input;
  const filtered = simpleOpenItems(result);
  return (
    <article className="report" lang="ja">
      <ReportHead input={input} result={result} title="OpenShift サイジングレポート（簡易版）" />
      <section>
        <h2>1. サイジング結果</h2>
        <SimpleVerdict view={simple.view} />
        <SimpleTables view={simple.view} />
        <Legend />
      </section>
      {network && <NetworkReportSection network={network} heading="2. ネットワーク構成（診断結果）" />}
      <section>
        <h2>3. 入力と前提</h2>
        <h3>3.1 仮想マシン（ゲスト VM のスペック）</h3>
        <table className="data input-table">
          <thead>
            <tr>
              <th scope="col">名前</th>
              <th scope="col">台数</th>
              <th scope="col">vCPU／台</th>
              <th scope="col">メモリ／台</th>
              <th scope="col">ディスク／台</th>
            </tr>
          </thead>
          <tbody>
            {s.vms.map((x, i) => (
              <tr key={x.id}>
                <th scope="row">{x.name || `VM ${i + 1}`}</th>
                <td>{v(x.count)}</td>
                <td>{v(x.vcpu)}</td>
                <td>{q(x.ram)}</td>
                <td>{q(x.disk)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>3.2 VM 用の物理サーバとクラスタ構成</h3>
        <table className="data input-table">
          <tbody>
            <tr>
              <th scope="row">物理サーバ</th>
              <td>
                {v(s.servers.count)} 台、CPU {v(s.servers.cpu)} 論理コア／台、メモリ {q(s.servers.ram)}／台
              </td>
            </tr>
            <tr>
              <th scope="row">CPU 割り当て比率</th>
              <td>{s.cpuRatio}:1</td>
            </tr>
            <tr>
              <th scope="row">停止・メンテナンスを許容する台数</th>
              <td>{s.tolerance} 台</td>
            </tr>
            <tr>
              <th scope="row">インフラノード</th>
              <td>{s.infra === 'separate' ? '別に 3 台用意する' : '使わない'}</td>
            </tr>
            <tr>
              <th scope="row">Namespace 数</th>
              <td>{v(s.namespaces)}</td>
            </tr>
            <tr>
              <th scope="row">共有ストレージの物理容量係数</th>
              <td>{v(s.storageFactor)}</td>
            </tr>
            <tr>
              <th scope="row">簡易版の仮定値</th>
              <td>
                常駐 Pod {v(s.assumptions.residentCpu)} コア・{q(s.assumptions.residentMem)}／台、ハード Eviction しきい値 {q(s.assumptions.evictionMem)}
              </td>
            </tr>
          </tbody>
        </table>
        <h3>3.3 前提と仮定</h3>
        <AssumptionList result={result} />
      </section>
      <section>
        <h2>4. 計算の内訳</h2>
        {result.groups
          .filter((g) => SIMPLE_GROUP_IDS.includes(g.id))
          .map((g) => (
            <div key={g.id} className="report-group">
              <h3>{g.title}</h3>
              {g.sections.map((sec) => (
                <SectionView key={sec.id} section={sec} print />
              ))}
            </div>
          ))}
      </section>
      <section>
        <h2>5. 確認事項（{filtered.openItems.length} 件）</h2>
        <p className="small">ネットワーク・ストレージ性能・監視などの確認項目は、詳細版で入力・確認できます。</p>
        <OpenItemsList result={filtered} />
      </section>
      <section>
        <h2>6. 出典一覧</h2>
        <p className="small">すべて Red Hat の 4.22 版公式資料です。章節番号は各資料ページ内の番号です。</p>
        <SourcesList result={result} />
      </section>
    </article>
  );
}
