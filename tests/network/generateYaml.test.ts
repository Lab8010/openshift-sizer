import { describe, expect, it } from 'vitest';
import { parseAllDocuments } from 'yaml';
import { diagnose } from '../../src/network/lib/diagnose';
import { defaultParams, generateYaml, visibleParams } from '../../src/network/lib/generateYaml';
import type { Answers } from '../../src/network/data/types';

const scenarios: Record<string, Answers> = {
  A: { q1: 'name-or-lb', q6: 'service-http-only', q5: 'l2-none', q7: 'reconnect-ok', q8: 'single' },
  B: { q1: 'guest-ip-direct', q2: 'inside-together', q3: 'new-subnet-ok', q4: 'either-ok', q9: 'vm-team-only' },
  C: { q1: 'guest-ip-direct', q2: 'outside', q3: 'reuse-vlan', q4: 'static-in-guest', q10: 'policy-wanted', q11: ['none'] },
  D: { q1: 'guest-ip-direct', q2: 'outside', q3: 'reuse-vlan', q10: 'policy-physical', q11: ['simple-legacy'] },
};

function docs(text: string) {
  const parsed = parseAllDocuments(text);
  for (const d of parsed) expect(d.errors, String(d.errors)).toEqual([]);
  return parsed.map((d) => d.toJS()).filter(Boolean);
}

function kinds(text: string) {
  return docs(text).map((d) => d.kind);
}

describe('YAML 生成', () => {
  it('何も入力しなくても（初期値で）生成できる', () => {
    for (const [id, a] of Object.entries(scenarios)) {
      const d = diagnose(a);
      expect(d.primary).toBe(id);
      const r = generateYaml(d, defaultParams(d));
      expect(r.errors).toEqual([]);
      expect(r.combined.startsWith('# これはサンプルです')).toBe(true);
      expect(r.combined).not.toMatch(/\{\{\w+\}\}/);
    }
  });

  it('A: VM (masquerade) + Service (ClusterIP) + Route', () => {
    const d = diagnose(scenarios.A);
    const r = generateYaml(d, defaultParams(d));
    expect(kinds(r.combined)).toEqual(['VirtualMachine', 'Service', 'Route']);
    const [vm, svc] = docs(r.combined);
    expect(vm.spec.template.spec.domain.devices.interfaces[0].masquerade).toEqual({});
    expect(vm.spec.template.metadata.labels.app).toBe('app-vm-01');
    expect(svc.spec.type).toBe('ClusterIP');
    expect(svc.spec.selector.app).toBe('app-vm-01');
    expect(svc.spec.ports[0].port).toBe(8080);
  });

  it('A: LoadBalancer のときは Route を出さない', () => {
    const d = diagnose({ ...scenarios.A, q6: 'service-ok' });
    const r = generateYaml(d, defaultParams(d));
    expect(kinds(r.combined)).toEqual(['VirtualMachine', 'Service']);
    expect(docs(r.combined)[1].spec.type).toBe('LoadBalancer');
  });

  it('B: Namespace + UDN / CUDN (Layer2, Primary, Persistent) + VM (bridge)', () => {
    const d = diagnose(scenarios.B);
    const udn = generateYaml(d, defaultParams(d));
    expect(kinds(udn.combined)).toEqual(['Namespace', 'UserDefinedNetwork', 'VirtualMachine']);
    const [ns, net, vm] = docs(udn.combined);
    expect(ns.metadata.labels).toHaveProperty('k8s.ovn.org/primary-user-defined-network');
    expect(net.spec.topology).toBe('Layer2');
    expect(net.spec.layer2.role).toBe('Primary');
    expect(net.spec.layer2.ipam.lifecycle).toBe('Persistent');
    expect(net.spec.layer2.subnets).toEqual(['192.168.100.0/24']);
    // 4.22: Primary UDN へは l2bridge バインディングで接続する
    expect(vm.spec.template.spec.domain.devices.interfaces[0]).toEqual({ name: 'default', binding: { name: 'l2bridge' } });
    expect(vm.spec.template.spec.networks[0]).toEqual({ name: 'default', pod: {} });

    const cudn = generateYaml(d, { ...defaultParams(d), networkScope: 'cluster' });
    const net2 = docs(cudn.combined)[1];
    expect(net2.kind).toBe('ClusterUserDefinedNetwork');
    expect(net2.spec.network.layer2.ipam.lifecycle).toBe('Persistent');
    expect(net2.spec.namespaceSelector.matchLabels['kubernetes.io/metadata.name']).toBe('vm-prod');
  });

  it('C: NNCP (bridge-mapping) + CUDN (Localnet) + VM', () => {
    const d = diagnose(scenarios.C);
    const r = generateYaml(d, { ...defaultParams(d), vlanId: '120' });
    expect(kinds(r.combined)).toEqual(['NodeNetworkConfigurationPolicy', 'ClusterUserDefinedNetwork', 'VirtualMachine']);
    const [nncp, cudn, vm] = docs(r.combined);
    expect(nncp.spec.desiredState.ovn['bridge-mappings'][0]).toEqual({ localnet: 'vlan120', bridge: 'br-ex', state: 'present' });
    expect(cudn.metadata.name).toBe('vlan120-network');
    expect(cudn.spec.network.localnet.physicalNetworkName).toBe('vlan120');
    expect(cudn.spec.network.localnet.vlan.access.id).toBe(120);
    expect(cudn.spec.network.localnet.ipam.mode).toBe('Disabled');
    const nets = vm.spec.template.spec.networks;
    expect(nets[1].multus.networkName).toBe('vlan120-network');
  });

  it('D: NNCP (vlan + linux-bridge) + NAD (bridge) + VM', () => {
    const d = diagnose(scenarios.D);
    const r = generateYaml(d, defaultParams(d));
    expect(kinds(r.combined)).toEqual(['NodeNetworkConfigurationPolicy', 'NetworkAttachmentDefinition', 'VirtualMachine']);
    const [nncp, nad, vm] = docs(r.combined);
    const ifaces = nncp.spec.desiredState.interfaces;
    expect(ifaces[0]).toMatchObject({ name: 'bond0.100', type: 'vlan', vlan: { 'base-iface': 'bond0', id: 100 } });
    expect(ifaces[1]).toMatchObject({ name: 'br-vlan100', type: 'linux-bridge' });
    expect(ifaces[1].bridge.port[0].name).toBe('bond0.100');
    const cni = JSON.parse(nad.spec.config);
    expect(cni).toMatchObject({ type: 'bridge', bridge: 'br-vlan100', name: 'br-vlan100' });
    expect(cni).not.toHaveProperty('ipam'); // VM 向けの NAD では IPAM は使えない
    expect(nad.metadata.annotations['k8s.v1.cni.cncf.io/resourceName']).toBe('bridge.network.kubevirt.io/br-vlan100');
    expect(vm.spec.template.spec.networks[1].multus.networkName).toBe('br-vlan100');
  });

  it('E: 追加 NIC 分の CUDN が別ファイルで出て、VM に 1 組追加される', () => {
    for (const a of Object.values(scenarios)) {
      const d = diagnose({ ...a, q8: 'multiple' });
      expect(d.modifiers).toContain('E');
      const r = generateYaml(d, defaultParams(d));
      expect(r.files.some((f) => f.id === 'secondary')).toBe(true);
      const all = docs(r.combined);
      const sec = all.find((x) => x.metadata.name === 'vlan200-network');
      expect(sec.spec.network.localnet.vlan.access.id).toBe(200);
      const vm = all.find((x) => x.kind === 'VirtualMachine');
      const ifaces = vm.spec.template.spec.domain.devices.interfaces;
      const nets = vm.spec.template.spec.networks;
      expect(ifaces.at(-1)).toEqual({ name: 'vlan200', bridge: {} });
      expect(nets.at(-1)).toEqual({ name: 'vlan200', multus: { networkName: 'vlan200-network' } });
      expect(ifaces.length).toBe(nets.length);
    }
  });

  it('VM は runStrategy: Always で起動する（running は使わない）', () => {
    for (const a of Object.values(scenarios)) {
      const d = diagnose(a);
      const vm = docs(generateYaml(d, defaultParams(d)).combined).find((x) => x.kind === 'VirtualMachine');
      expect(vm.spec.runStrategy).toBe('Always');
      expect(vm.spec).not.toHaveProperty('running');
    }
  });

  it('F: SR-IOV は参考タブとしてだけ出し、一括 YAML には含めない', () => {
    const d = diagnose({ ...scenarios.C, q11: ['high-performance'] });
    const r = generateYaml(d, defaultParams(d));
    expect(r.files.find((f) => f.id === 'sriov')?.reference).toBe(true);
    expect(r.combined).not.toContain('sriov');
  });

  it('バリデーション: エラー時は生成しない', () => {
    const d = diagnose(scenarios.C);
    const bad = generateYaml(d, { ...defaultParams(d), vlanId: '5000', namespace: 'VM_Prod' });
    expect(bad.files).toEqual([]);
    expect(bad.errors.map((e) => e.field).sort()).toEqual(['namespace', 'vlanId']);

    const dB = diagnose(scenarios.B);
    expect(generateYaml(dB, { ...defaultParams(dB), subnet: '192.168.1.0' }).errors[0].field).toBe('subnet');
    expect(generateYaml(dB, { ...defaultParams(dB), subnet: '300.1.1.0/24' }).errors[0].field).toBe('subnet');

    const dD = diagnose(scenarios.D);
    expect(generateYaml(dD, { ...defaultParams(dD), nodeInterface: 'enp1s0f0np0', vlanId: '1000' }).errors[0].field).toBe('nodeInterface');
  });

  it('主要パラメータは最大 5 項目', () => {
    for (const a of Object.values(scenarios)) {
      const d = diagnose({ ...a, q8: 'multiple' });
      expect(visibleParams(d).main.length).toBeLessThanOrEqual(5);
    }
  });
});
