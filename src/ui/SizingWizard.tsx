// 簡易版：1 問ずつ答えるウィザード（Network Advisor と同じ構成）。
import { useContext, useEffect, useState, type ReactNode } from 'react';
import {
  CPU_RATIO_OPTIONS,
  SCALE_OPTIONS,
  SERVER_PRESETS,
  SIMPLE_BACKEND_ID,
  VM_PRESETS,
  emptySimpleVm,
  presetVmId,
  type CpuRatio,
  type SimpleInput,
  type Tolerance,
} from '../domain/simple';
import { CAPACITY_UNITS, MEMORY_UNITS } from '../domain/units';
import { ErrorsContext } from './fields';
import { Button, Details, OptionCard, TwNumber, TwQty, TwText, UnsureHint } from './kit';
import { RefLink } from './common';

export type SimpleUpdate = (fn: (d: SimpleInput) => void) => void;

interface Props {
  simple: SimpleInput;
  update: SimpleUpdate;
  index: number;
  onIndexChange: (i: number) => void;
  onDone: () => void;
  onExit: () => void;
}

interface Step {
  id: string;
  title: string;
  lead: string;
  help: ReactNode;
  unsure: ReactNode;
  optional?: boolean;
  body: ReactNode;
  valid: boolean;
}

const posInt = (s: string) => /^\s*\d+\s*$/.test(s) && Number(s) > 0;

function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 }) {
  return (
    <div role="radiogroup" className={`mt-6 grid gap-3 ${cols === 2 ? 'md:grid-cols-2' : ''}`}>
      {children}
    </div>
  );
}

export function SizingWizard({ simple, update, index, onIndexChange, onDone, onExit }: Props) {
  const errors = useContext(ErrorsContext);
  const hasErr = (prefix: string) => [...errors.keys()].some((k) => k.startsWith(prefix));
  const [customServer, setCustomServer] = useState(() => !!simple.servers.cpu && !SERVER_PRESETS.some((p) => p.cpu === simple.servers.cpu && p.ramGiB === simple.servers.ram.raw && simple.servers.ram.unit === 'GiB'));
  const [countKnown, setCountKnown] = useState<boolean | null>(() => (simple.servers.count ? true : null));
  const [customFactor, setCustomFactor] = useState(() => !!simple.storageFactor && !['2', '3'].includes(simple.storageFactor));

  const steps = buildSteps();
  const safeIndex = Math.min(index, steps.length - 1);
  const step = steps[safeIndex];
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step.id]);
  const progress = Math.round(((safeIndex + 1) / steps.length) * 100);
  const last = safeIndex + 1 >= steps.length;

  function setPresetCount(key: string, label: string, vcpu: string, ram: string, disk: string, count: string) {
    update((d) => {
      const id = presetVmId(key);
      const i = d.vms.findIndex((v) => v.id === id);
      if (count.trim() === '' || count.trim() === '0') {
        if (i >= 0) d.vms.splice(i, 1);
        return;
      }
      const row = { id, name: `${label}（${vcpu} vCPU・${ram} GiB）`, count, vcpu, ram: { raw: ram, unit: 'GiB' as const }, disk: { raw: disk, unit: 'GiB' as const } };
      if (i >= 0) d.vms[i] = row;
      else d.vms.push(row);
    });
  }

  function buildSteps(): Step[] {
    const s = simple;
    const customVms = s.vms.filter((v) => !v.id.startsWith('preset-'));
    const totalVms = s.vms.reduce((a, v) => a + (posInt(v.count) ? Number(v.count) : 0), 0);
    const vmValid = totalVms > 0 && s.vms.every((v) => posInt(v.count) && v.vcpu && v.ram.raw) && !hasErr('vms.');

    return [
      {
        id: 'vms',
        title: 'どんなサイズの VM を、何台載せますか？',
        lead: 'サイズごとに台数を入れてください。目安のサイズに合わなければ、カスタムサイズを追加できます。',
        help: (
          <>
            台数は「同時に動かす VM の数」として CPU・メモリを計算し、ディスクは台数分を確保する前提で計算します。VM ごとに OpenShift Virtualization の追加メモリ（約 218 MiB + vCPU あたり 8 MiB など）も加えます <RefLink refKey="vmMemOverheadBase" />。S〜XL はこのアプリの目安サイズで、公式の値ではありません。
          </>
        ),
        unsure: '移行元の vSphere から VM 一覧（vCPU・メモリ・ディスク）を書き出し、近いサイズにまとめて数えると早く入力できます。正確に入れたい VM はカスタムサイズで追加してください。',
        valid: vmValid,
        body: (
          <>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {VM_PRESETS.map((p) => {
                const row = s.vms.find((v) => v.id === presetVmId(p.key));
                const active = !!row && posInt(row.count);
                return (
                  <div key={p.key} className={`flex flex-col rounded-xl border-2 bg-white p-4 transition ${active ? 'border-red-700 shadow-sm' : 'border-slate-200'}`}>
                    <div className="flex items-baseline gap-3">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-sm font-bold text-slate-700">{p.label}</span>
                      <span className="font-semibold text-slate-900">
                        {p.vcpu} vCPU・{p.ramGiB} GiB メモリ・{p.diskGiB} GiB ディスク
                      </span>
                    </div>
                    <span className="mt-2 text-sm leading-relaxed text-slate-600">例: {p.example}</span>
                    <TwNumber
                      className="mt-3 max-w-[12rem]"
                      path={`vms.${presetVmId(p.key)}.definedCount`}
                      label={`${p.label} サイズの台数`}
                      suffix="台"
                      value={row?.count ?? ''}
                      onChange={(v) => setPresetCount(p.key, p.label, p.vcpu, p.ramGiB, p.diskGiB, v)}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-800">カスタムサイズ</h3>
              {customVms.length > 0 && (
                <div className="mt-2 space-y-3">
                  {customVms.map((v, i) => {
                    const base = `vms.${v.id}`;
                    const set = (fn: (x: typeof v) => void) =>
                      update((d) => {
                        const t = d.vms.find((x) => x.id === v.id);
                        if (t) fn(t);
                      });
                    return (
                      <div key={v.id} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1.4fr_0.8fr_0.8fr_1.3fr_1.3fr_auto] sm:items-end">
                        <TwText path={`${base}.name`} label="名前" value={v.name} placeholder={`カスタム ${i + 1}`} onChange={(x) => set((t) => void (t.name = x))} />
                        <TwNumber path={`${base}.definedCount`} label="台数" value={v.count} onChange={(x) => set((t) => void (t.count = x))} />
                        <TwNumber path={`${base}.vcpu`} label="vCPU" value={v.vcpu} onChange={(x) => set((t) => void (t.vcpu = x))} />
                        <TwQty path={`${base}.ram`} label="メモリ" value={v.ram} units={MEMORY_UNITS} onChange={(x) => set((t) => void (t.ram = x))} />
                        <TwQty path={`${base}.disk`} label="ディスク" value={v.disk} units={CAPACITY_UNITS} onChange={(x) => set((t) => void (t.disk = x))} />
                        <Button variant="ghost" className="!px-3" onClick={() => update((d) => void (d.vms = d.vms.filter((x) => x.id !== v.id)))}>
                          削除
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              <Button variant="secondary" className="mt-3" onClick={() => update((d) => void d.vms.push({ ...emptySimpleVm(), name: `カスタム ${customVms.length + 1}` }))}>
                ＋ カスタムサイズを追加
              </Button>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              合計 <span className="font-semibold text-slate-900">{totalVms}</span> 台
            </p>
          </>
        ),
      },
      {
        id: 'cpu',
        title: 'VM の CPU は、物理 CPU をどのくらい共有させますか？',
        lead: '共有させるほど、少ない物理 CPU で多くの vCPU を動かせます（CPU のオーバーコミット）。',
        help: (
          <>
            共有 CPU の VM は、vCPU 数 ÷ 割り当て比率（vmiCPUAllocationRatio）を CPU 要求量としてサーバに割り当てます <RefLink refKey="cpuAllocationRatio" />。比率を大きくすると必要なサーバは減りますが、VM が同時に忙しくなると CPU を取り合います。VM ごとに専用 CPU を割り当てる場合は詳細版で指定してください。
          </>
        ),
        unsure: '今の vSphere で「VM の vCPU 合計 ÷ ホストの論理プロセッサ数」を見て、実績に近い比率を選んでください。判断がつかなければ「共有しない（1:1）」で安全側に見積もれます。',
        valid: true,
        body: (
          <Grid>
            {CPU_RATIO_OPTIONS.map((r) => {
              const meta: Record<CpuRatio, [string, string]> = {
                '1': ['共有しない（1:1）', '性能を優先する DB や、遅延に厳しいシステム'],
                '2': ['少し共有する（2:1）', 'CPU を比較的よく使う業務アプリケーション'],
                '4': ['共有する（4:1）', '負荷が平らな Web・AP サーバー'],
                '8': ['大きく共有する（8:1）', '開発・検証環境など、普段は空いている VM が多い'],
                '10': ['最大限に共有する（10:1）', 'ほとんど待機している VM が大半'],
              };
              return (
                <OptionCard
                  key={r}
                  selected={s.cpuRatio === r}
                  onSelect={() => update((d) => void (d.cpuRatio = r))}
                  label={meta[r][0]}
                  example={meta[r][1]}
                  consequence={r === '1' ? 'vCPU と同じ数の CPU を確保して計算します' : `vCPU ÷ ${r} を CPU 要求量として計算します`}
                />
              );
            })}
          </Grid>
        ),
      },
      {
        id: 'server',
        title: 'VM を載せる物理サーバは、1 台あたりどのくらいの大きさですか？',
        lead: 'VM を動かすサーバ（コンピュートノード）の CPU とメモリです。同じ仕様のサーバを並べる前提で計算します。',
        help: (
          <>
            CPU は論理コア数（ハイパースレッディング有効時はスレッド数）です。1 台の容量から、システム予約（公式の自動計算式）と OpenShift Virtualization の管理分（約 2 コア・360 MiB）などを差し引いて、VM に使える量を計算します <RefLink refKey="OCP-NODES" /> <RefLink refKey="virtCpuPerWorker" />。
          </>
        ),
        unsure: '調達予定のサーバの仕様、または今の ESXi ホストの「論理プロセッサ数」とメモリを使ってください。',
        valid: !!s.servers.cpu && !!s.servers.ram.raw && !hasErr('roles.compute.cpu') && !hasErr('roles.compute.ram'),
        body: (
          <Grid>
            {SERVER_PRESETS.map((p) => (
              <OptionCard
                key={p.key}
                selected={!customServer && s.servers.cpu === p.cpu && s.servers.ram.raw === p.ramGiB && s.servers.ram.unit === 'GiB'}
                onSelect={() => {
                  setCustomServer(false);
                  update((d) => {
                    d.servers.cpu = p.cpu;
                    d.servers.ram = { raw: p.ramGiB, unit: 'GiB' };
                  });
                }}
                label={`${p.cpu} 論理コア・${p.ramGiB} GiB メモリ`}
                example={p.example}
              />
            ))}
            <OptionCard selected={customServer} onSelect={() => setCustomServer(true)} label="その他の仕様を入力する" example="上のどれにも近くないサーバ">
              {customServer && (
                <div className="mt-3 grid gap-3 pl-8 sm:grid-cols-2">
                  <TwNumber path="roles.compute.cpu" label="CPU（論理コア数）" value={s.servers.cpu} onChange={(v) => update((d) => void (d.servers.cpu = v))} />
                  <TwQty path="roles.compute.ram" label="メモリ" value={s.servers.ram} units={MEMORY_UNITS} onChange={(v) => update((d) => void (d.servers.ram = v))} />
                </div>
              )}
            </OptionCard>
          </Grid>
        ),
      },
      {
        id: 'count',
        title: '物理サーバの台数は決まっていますか？',
        lead: '決まっていれば、その台数で収まるかを判定します。決まっていなければ、必要な台数を計算します。',
        help: '必要台数は、CPU とメモリの両方が足りて、次の質問で選ぶ「止まってもよい台数」を差し引いても VM が載る最小の台数です。コンピュートノードは最低 2 台必要です。',
        unsure: '決まっていなければ「計算してほしい」を選んでください。結果を見たあとで「回答を直す」から台数を入れて確かめられます。',
        valid: countKnown === false || (countKnown === true && posInt(s.servers.count)),
        body: (
          <Grid>
            <OptionCard selected={countKnown === true} onSelect={() => setCountKnown(true)} label="決まっている（台数を入れる）" example="調達済み・見積もり済みの構成を確かめたい" consequence="その台数で収まるかを判定します">
              {countKnown === true && (
                <TwNumber className="mt-3 max-w-[12rem] pl-8" path="roles.compute.count" label="物理サーバの台数" suffix="台" value={s.servers.count} onChange={(v) => update((d) => void (d.servers.count = v))} />
              )}
            </OptionCard>
            <OptionCard
              selected={countKnown === false}
              onSelect={() => {
                setCountKnown(false);
                update((d) => void (d.servers.count = ''));
              }}
              label="必要な台数を計算してほしい"
              example="これから構成を考える"
              consequence="必要な台数を計算します"
            />
          </Grid>
        ),
      },
      {
        id: 'tolerance',
        title: 'サーバが何台止まっても、VM を動かし続けたいですか？',
        lead: '障害のときや、OpenShift の更新でサーバを 1 台ずつ再起動するときに、残りのサーバへ VM を移せる余裕を見込みます。',
        help: (
          <>
            選んだ台数を除いた残りのサーバに、すべての VM が載るかを確かめます。また、メンテナンスで同時に退避（drain）させるサーバ台数として、ライブマイグレーション用の予備メモリ（≈ 同時に drain する台数 × 1 台に載る VM メモリの最大合計）も別に確かめます <RefLink refKey="migrationReserve" />。
          </>
        ),
        unsure: '本番環境なら「1 台止まっても動かし続ける」を選んでおくと、メンテナンス中の容量不足を見落としにくくなります。',
        valid: true,
        body: (
          <Grid>
            {(['0', '1', '2'] as Tolerance[]).map((t) => {
              const meta: Record<Tolerance, [string, string, string]> = {
                '0': ['止まることは見込まない', '検証環境など、サーバが止まったら VM も止まってよい', 'すべてのサーバが動いている前提で計算します'],
                '1': ['1 台止まっても動かし続ける（N+1）', '本番環境で、障害やメンテナンス中も VM を止めたくない', '1 台少ない状態でもすべての VM が載る台数を計算します'],
                '2': ['2 台止まっても動かし続ける（N+2）', '大きなクラスタや、障害中にメンテナンスも行う可能性がある', '2 台少ない状態でもすべての VM が載る台数を計算します'],
              };
              return <OptionCard key={t} selected={s.tolerance === t} onSelect={() => update((d) => void (d.tolerance = t))} label={meta[t][0]} example={meta[t][1]} consequence={meta[t][2]} />;
            })}
          </Grid>
        ),
      },
      {
        id: 'infra',
        title: '監視や Ingress などの基盤サービスを、専用のサーバに分けますか？',
        lead: 'コントロールプレーン 3 台は常に別に必要です。ここでは、基盤サービス用のインフラノードを分けるかを決めます。',
        help: (
          <>
            インフラノードは一般にクラスタあたり 3 台が推奨されています <RefLink refKey="infraRecommendedCount" />。OpenShift Virtualization は監視やルーティングの負荷を増やすため、基盤サービスを載せるサーバに合計約 4 コア・2,179 MiB の追加分を見込みます <RefLink refKey="virtCpuInfraTotal" />。
          </>
        ),
        unsure: '分けておくと、VM 用サーバの容量が監視などの負荷に左右されにくくなります。サーバ台数を最小にしたい小規模構成なら「分けない」を選んでください。',
        valid: true,
        body: (
          <Grid>
            <OptionCard
              selected={s.infra === 'separate'}
              onSelect={() => update((d) => void (d.infra = 'separate'))}
              label="分ける（インフラノード 3 台）"
              example="ある程度の規模で、VM 用サーバを VM に集中させたい"
              consequence="インフラノード 3 台の 1 台あたりの目安を表示します"
            />
            <OptionCard
              selected={s.infra === 'none'}
              onSelect={() => update((d) => void (d.infra = 'none'))}
              label="分けない"
              example="小規模構成で、サーバの台数を抑えたい"
              consequence="Virtualization のインフラ分を VM 用サーバに含めて計算します"
            />
          </Grid>
        ),
      },
      {
        id: 'scale',
        title: 'クラスタは、どのくらいの規模で使いますか？',
        lead: 'コントロールプレーンに必要な大きさは、プロジェクト（Namespace）の数で変わります。',
        optional: true,
        help: (
          <>
            Red Hat の公式試験（Namespace 500・1,000・4,000 とノード台数の組み合わせ）と比べて、コントロールプレーンとインフラノードの目安を出します <RefLink refKey="cpScale24" />。選んだ規模が公式試験の範囲を超える場合は「要個別評価」と表示します。
          </>
        ),
        unsure: '利用者や用途がまだ決まっていなければ「分からない」を選んでください。コントロールプレーンはインストール最低要件で表示します。',
        valid: true,
        body: (
          <Grid>
            {SCALE_OPTIONS.map((o) => (
              <OptionCard
                key={o.value || 'unknown'}
                selected={s.namespaces === o.value}
                onSelect={() => update((d) => void (d.namespaces = o.value))}
                label={o.label}
                example={o.example}
                consequence={o.value ? '公式試験の参考点からコントロールプレーンの目安を出します' : 'インストール最低要件で目安を出します'}
              />
            ))}
          </Grid>
        ),
      },
      {
        id: 'storage',
        title: 'VM のディスクは、何重に保存しますか？',
        lead: '共有ストレージに必要な物理容量の目安を出すために使います。',
        optional: true,
        help: '物理容量 ≈ VM ディスクの合計 × 保存する重さ（物理容量係数）として計算します。スナップショットや空き容量の見込みは含めません。性能（IOPS・スループット）は詳細版で確かめてください。',
        unsure: '使うストレージ製品が決まっていなければ「分からない」を選んでください。論理容量（VM ディスクの合計）だけを表示します。',
        valid: !customFactor || (!!s.storageFactor && !hasErr(`backends.${SIMPLE_BACKEND_ID}`)),
        body: (
          <Grid>
            <OptionCard
              selected={!customFactor && s.storageFactor === '3'}
              onSelect={() => {
                setCustomFactor(false);
                update((d) => void (d.storageFactor = '3'));
              }}
              label="3 重に保存する（3 レプリカ）"
              example="ソフトウェア定義ストレージで、データのコピーを 3 つ持つ"
              consequence="VM ディスクの合計 × 3 を物理容量として表示します"
            />
            <OptionCard
              selected={!customFactor && s.storageFactor === '2'}
              onSelect={() => {
                setCustomFactor(false);
                update((d) => void (d.storageFactor = '2'));
              }}
              label="2 重に保存する（ミラー）"
              example="2 つのコピーを持つ構成"
              consequence="VM ディスクの合計 × 2 を物理容量として表示します"
            />
            <OptionCard selected={customFactor} onSelect={() => setCustomFactor(true)} label="係数を指定する" example="RAID やイレイジャーコーディングなど">
              {customFactor && (
                <TwNumber
                  className="mt-3 max-w-[12rem] pl-8"
                  path={`backends.${SIMPLE_BACKEND_ID}.factor`}
                  label="物理容量係数"
                  value={s.storageFactor}
                  hint="例：RAID 6（8D+2P）なら 1.25"
                  onChange={(v) => update((d) => void (d.storageFactor = v))}
                />
              )}
            </OptionCard>
            <OptionCard
              selected={!customFactor && s.storageFactor === ''}
              onSelect={() => {
                setCustomFactor(false);
                update((d) => void (d.storageFactor = ''));
              }}
              label="分からない"
              example="ストレージ製品がまだ決まっていない"
              consequence="論理容量だけを表示します"
            />
          </Grid>
        ),
      },
    ];
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <div className="mb-6">
        <div className="flex items-baseline justify-between text-sm text-slate-500">
          <span>
            質問 <span className="font-semibold text-slate-800">{safeIndex + 1}</span> / {steps.length}
          </span>
          <span>{step.optional ? 'この質問は任意です' : '選んだら「次へ」で進みます'}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="回答の進み具合">
          <div className="h-full rounded-full bg-red-700 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <section aria-labelledby={`${step.id}-title`}>
        <p className="text-sm font-medium text-red-700">
          質問 {safeIndex + 1}
          {step.optional ? '（任意）' : ''}
        </p>
        <h2 id={`${step.id}-title`} className="mt-1 text-xl font-bold leading-snug text-slate-900 sm:text-2xl">
          {step.title}
        </h2>
        <p className="mt-2 text-slate-600">{step.lead}</p>
        <Details summary="詳しく（なぜ聞くのか）">{step.help}</Details>
        {step.body}
        <UnsureHint>{step.unsure}</UnsureHint>
      </section>

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={() => (safeIndex === 0 ? onExit() : onIndexChange(safeIndex - 1))}>
          ← {safeIndex === 0 ? 'トップへ' : '戻る'}
        </Button>
        <Button onClick={() => (last ? onDone() : onIndexChange(safeIndex + 1))} disabled={!step.valid}>
          {last ? 'サイジング結果を見る' : '次へ'} →
        </Button>
      </div>
    </div>
  );
}

export const WIZARD_STEP_COUNT = 8;
