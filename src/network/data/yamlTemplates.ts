import { PLATFORM_LABEL } from './version';
/**
 * §7.3 の YAML テンプレート（正本）。
 * {{name}} は単純な文字列置換で埋める。
 * 行に {{extraInterfaces}} / {{extraNetworks}} だけがある場合、その行は追加分のスニペットに置き換わる（空なら行ごと消える）。
 */

export const yamlHeader = `# これはサンプルです。環境に合わせてレビューの上ご利用ください。
# 生成元: OpenShift VM Network Advisor
# 想定: ${PLATFORM_LABEL}`;

// ---------------------------------------------------------------------------
// パターン A: VM (masquerade) + Service (+ 任意で Route)
// ---------------------------------------------------------------------------

export const tplA_vm = `# NNCP / ネットワーク定義は不要（Pod Network をそのまま使う）
apiVersion: kubevirt.io/v1
kind: VirtualMachine
metadata:
  name: {{vmName}}
  namespace: {{namespace}}
  labels:
    app: {{vmName}}
spec:
  runStrategy: Always
  template:
    metadata:
      labels:
        kubevirt.io/domain: {{vmName}}
        app: {{vmName}}            # Service の selector と一致させる
    spec:
      domain:
        devices:
          disks:
            - name: rootdisk
              disk:
                bus: virtio
          interfaces:
            - name: default
              masquerade: {}       # Pod Network + NAT。ゲスト IP は宛先にならない
{{extraInterfaces}}
        resources:
          requests:
            cpu: "{{cpu}}"
            memory: {{memory}}
      networks:
        - name: default
          pod: {}
{{extraNetworks}}
      volumes:
        - name: rootdisk
          containerDisk:
            image: <guest-image>   # TODO: 実際のゲストイメージに差し替える`;

export const tplA_service = `apiVersion: v1
kind: Service
metadata:
  name: {{vmName}}
  namespace: {{namespace}}
spec:
  type: {{serviceType}}            # ClusterIP / NodePort / LoadBalancer
  selector:
    app: {{vmName}}                # virt-launcher Pod のラベルを指す（VM オブジェクトではない）
  ports:
    - port: {{servicePort}}
      targetPort: {{servicePort}}`;

export const tplA_route = `# HTTP/HTTPS 用。HTTP 以外のプロトコルは Route では公開できない
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: {{vmName}}
  namespace: {{namespace}}
spec:
  to:
    kind: Service
    name: {{vmName}}
  port:
    targetPort: {{servicePort}}`;

// ---------------------------------------------------------------------------
// パターン B: (C)UDN (Layer2, Primary, Persistent IPAM) + VM (bridge)
// ---------------------------------------------------------------------------

export const tplB_namespace = `# Primary UDN を使う namespace は、作成時にこのラベルを付けておく必要がある
# ラベルは後から追加・変更できない。既存の namespace に UDN を作っても受け付けられないため、
# このファイルを最初に適用して namespace を新規作成すること
apiVersion: v1
kind: Namespace
metadata:
  name: {{namespace}}
  labels:
    k8s.ovn.org/primary-user-defined-network: ""`;

export const tplB_cudn = `# クラスタスコープ版（複数 namespace で同じネットワークを共有する）
apiVersion: k8s.ovn.org/v1
kind: ClusterUserDefinedNetwork
metadata:
  name: {{vmName}}-layer2
spec:
  namespaceSelector:
    matchLabels:
      kubernetes.io/metadata.name: {{namespace}}
  network:
    topology: Layer2
    layer2:
      role: Primary                # この namespace のデフォルトネットワークを置き換える
      subnets:
        - "{{subnet}}"
      ipam:
        lifecycle: Persistent      # ライブマイグレーション後も同じ IP を維持する`;

export const tplB_udn = `# namespace スコープ版（この namespace の中だけで使う）
apiVersion: k8s.ovn.org/v1
kind: UserDefinedNetwork
metadata:
  name: {{vmName}}-layer2
  namespace: {{namespace}}
spec:
  topology: Layer2
  layer2:
    role: Primary                  # この namespace のデフォルトネットワークを置き換える
    subnets:
      - "{{subnet}}"
    ipam:
      lifecycle: Persistent        # ライブマイグレーション後も同じ IP を維持する`;

export const tplB_vm = `apiVersion: kubevirt.io/v1
kind: VirtualMachine
metadata:
  name: {{vmName}}
  namespace: {{namespace}}
spec:
  runStrategy: Always
  template:
    metadata:
      labels:
        kubevirt.io/domain: {{vmName}}
    spec:
      domain:
        devices:
          disks:
            - name: rootdisk
              disk:
                bus: virtio
          interfaces:
            - name: default
              binding:
                name: l2bridge     # Primary UDN への接続方式（既定）。NAT なしでゲスト IP が本物の宛先になる
{{extraInterfaces}}
        resources:
          requests:
            cpu: "{{cpu}}"
            memory: {{memory}}
      networks:
        - name: default
          pod: {}                  # Primary UDN が Pod Network を置き換えるため pod のままでよい
{{extraNetworks}}
      volumes:
        - name: rootdisk
          containerDisk:
            image: <guest-image>   # TODO: 実際のゲストイメージに差し替える`;

// ---------------------------------------------------------------------------
// パターン C: NNCP (bridge-mapping) + CUDN (Localnet) + VM (bridge)
// ---------------------------------------------------------------------------

export const tplC_nncp = `# 1) ノード側の配線: 論理名 {{physicalNetworkName}} を {{uplinkBridge}} へ対応付ける
#    全ノードに同名・同構成で存在することが必須（欠けたノードへ移行するとネットワークが消える）
#    br-ex 以外の専用 OVS ブリッジを使う場合は、そのブリッジを作る NNCP が別途必要
apiVersion: nmstate.io/v1
kind: NodeNetworkConfigurationPolicy
metadata:
  name: localnet-{{physicalNetworkName}}
spec:
  desiredState:
    ovn:
      bridge-mappings:
        - localnet: {{physicalNetworkName}}
          bridge: {{uplinkBridge}}
          state: present`;

export const tplC_cudn = `# 2) ネットワーク定義: Localnet（Secondary として追加 NIC で使う形を基本とする）
#    作成すると、選んだ namespace に同名の NetworkAttachmentDefinition が作られる
#    NAD（type: ovn-k8s-cni-overlay, topology: localnet）を直接書いて代替する構成もあり得る
apiVersion: k8s.ovn.org/v1
kind: ClusterUserDefinedNetwork
metadata:
  name: {{physicalNetworkName}}-network
spec:
  namespaceSelector:
    matchLabels:
      kubernetes.io/metadata.name: {{namespace}}
  network:
    topology: Localnet
    localnet:
      role: Secondary
      physicalNetworkName: {{physicalNetworkName}}
      ipam:
        mode: Disabled             # VM の Localnet では必須。物理 DHCP / ゲスト静的設定を正とする
      vlan:
        mode: Access
        access:
          id: {{vlanId}}`;

export const tplC_vm = `# 3) VM: Pod Network を管理用に残し、業務系は Localnet 側の NIC で受ける例
apiVersion: kubevirt.io/v1
kind: VirtualMachine
metadata:
  name: {{vmName}}
  namespace: {{namespace}}
spec:
  runStrategy: Always
  template:
    metadata:
      labels:
        kubevirt.io/domain: {{vmName}}
    spec:
      domain:
        devices:
          disks:
            - name: rootdisk
              disk:
                bus: virtio
          interfaces:
            - name: default
              masquerade: {}
            - name: {{physicalNetworkName}}
              bridge: {}           # NAT なし。物理 VLAN 上のゲスト IP がそのまま宛先になる
{{extraInterfaces}}
        resources:
          requests:
            cpu: "{{cpu}}"
            memory: {{memory}}
      networks:
        - name: default
          pod: {}
        - name: {{physicalNetworkName}}
          multus:
            networkName: {{physicalNetworkName}}-network
{{extraNetworks}}
      volumes:
        - name: rootdisk
          containerDisk:
            image: <guest-image>   # TODO: 実際のゲストイメージに差し替える`;

// ---------------------------------------------------------------------------
// パターン D: NNCP (linux-bridge) + NAD (bridge) + VM (bridge)
// ---------------------------------------------------------------------------

export const tplD_nncp = `# 1) ノード側: VLAN サブインターフェース + Linux Bridge を各ノードに作る
#    全ノードに同名・同構成で存在することが必須
apiVersion: nmstate.io/v1
kind: NodeNetworkConfigurationPolicy
metadata:
  name: {{linuxBridgeName}}-policy
spec:
  desiredState:
    interfaces:
      - name: {{nodeInterface}}.{{vlanId}}
        type: vlan
        state: up
        vlan:
          base-iface: {{nodeInterface}}
          id: {{vlanId}}
      - name: {{linuxBridgeName}}
        type: linux-bridge
        state: up
        bridge:
          options:
            stp:
              enabled: false
          port:
            - name: {{nodeInterface}}.{{vlanId}}`;

export const tplD_nad = `# 2) 接続定義: NAD はスイッチではなく「どのブリッジに繋ぐか」の定義
#    VLAN はノード側（{{nodeInterface}}.{{vlanId}}）で付けているので、ここには書かない。VM 向けの NAD では IPAM は使えない
apiVersion: k8s.cni.cncf.io/v1
kind: NetworkAttachmentDefinition
metadata:
  name: {{linuxBridgeName}}
  namespace: {{namespace}}
  annotations:
    # 任意: このブリッジがあるノードにだけ VM を配置する
    k8s.v1.cni.cncf.io/resourceName: bridge.network.kubevirt.io/{{linuxBridgeName}}
spec:
  config: |
    {
      "cniVersion": "0.3.1",
      "name": "{{linuxBridgeName}}",
      "type": "bridge",
      "bridge": "{{linuxBridgeName}}"
    }`;

export const tplD_vm = `# 3) VM
apiVersion: kubevirt.io/v1
kind: VirtualMachine
metadata:
  name: {{vmName}}
  namespace: {{namespace}}
spec:
  runStrategy: Always
  template:
    metadata:
      labels:
        kubevirt.io/domain: {{vmName}}
    spec:
      domain:
        devices:
          disks:
            - name: rootdisk
              disk:
                bus: virtio
          interfaces:
            - name: default
              masquerade: {}
            - name: {{linuxBridgeName}}
              bridge: {}           # NAT なし。OVN（br-int）を通らずノードの Linux Bridge へ出る
{{extraInterfaces}}
        resources:
          requests:
            cpu: "{{cpu}}"
            memory: {{memory}}
      networks:
        - name: default
          pod: {}
        - name: {{linuxBridgeName}}
          multus:
            networkName: {{linuxBridgeName}}
{{extraNetworks}}
      volumes:
        - name: rootdisk
          containerDisk:
            image: <guest-image>   # TODO: 実際のゲストイメージに差し替える`;

// ---------------------------------------------------------------------------
// パターン E: 追加 NIC 分（Secondary）
// ---------------------------------------------------------------------------

export const tplE_cudn = `# 追加セグメント用の CUDN（Localnet, Secondary）
# 主となる構成とは別に、論理名 {{secondaryNetworkName}} の bridge-mapping を NNCP に追加しておく必要がある
#   ovn.bridge-mappings: [{ localnet: {{secondaryNetworkName}}, bridge: <OVS ブリッジ>, state: present }]
apiVersion: k8s.ovn.org/v1
kind: ClusterUserDefinedNetwork
metadata:
  name: {{secondaryNetworkName}}-network
spec:
  namespaceSelector:
    matchLabels:
      kubernetes.io/metadata.name: {{namespace}}
  network:
    topology: Localnet
    localnet:
      role: Secondary
      physicalNetworkName: {{secondaryNetworkName}}
      ipam:
        mode: Disabled             # VM の Localnet では必須。物理 DHCP / ゲスト静的設定を正とする
      vlan:
        mode: Access
        access:
          id: {{secondaryVlanId}}`;

/** VM の interfaces に追加する 1 組（インデントは VM テンプレートに合わせる） */
export const snippetE_interface = `            - name: {{secondaryNetworkName}}
              bridge: {}           # 追加 NIC（Secondary）`;

/** VM の networks に追加する 1 組 */
export const snippetE_network = `        - name: {{secondaryNetworkName}}
          multus:
            networkName: {{secondaryNetworkName}}-network`;

// ---------------------------------------------------------------------------
// パターン F: SR-IOV（参考のみ）
// ---------------------------------------------------------------------------

export const tplF_nad = `# 参考: SR-IOV の NAD。詳細は環境の SR-IOV Network Operator 設定に強く依存するため、
# このアプリでは「検討メモ」として提示し、完成品としては扱わない。
apiVersion: k8s.cni.cncf.io/v1
kind: NetworkAttachmentDefinition
metadata:
  name: sriov-net
  namespace: {{namespace}}
spec:
  config: |
    {
      "cniVersion": "0.3.1",
      "name": "sriov-net",
      "type": "sriov"
    }`;
