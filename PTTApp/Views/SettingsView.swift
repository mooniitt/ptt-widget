import SwiftUI
import WidgetKit

/// Token 与小组件偏好设置界面
public struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var tokens: [String] = []
    @State private var newTokenText: String = ""
    @State private var showSuccessAlert: Bool = false
    
    public init() {}
    
    public var body: some View {
        NavigationStack {
            List {
                // Section 1: 已配置的 Token
                Section {
                    if tokens.isEmpty {
                        Text("尚未配置 Token，请添加")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(tokens.indices, id: \.self) { idx in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text("账号 \(idx + 1)")
                                        .font(.system(size: 14, weight: .bold))
                                    Spacer()
                                    Text("已生效")
                                        .font(.system(size: 11))
                                        .foregroundStyle(.green)
                                }
                                Text(tokens[idx])
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                            .padding(.vertical, 2)
                        }
                        .onDelete(perform: deleteToken)
                    }
                } header: {
                    Text("当前订阅 Token 列表 (支持双账号/多账号)")
                } footer: {
                    Text("左滑可删除对应 Token。桌面小组件将按顺序默认展示双账号对比。")
                }
                
                // Section 2: 添加新 Token
                Section("添加新 Token") {
                    HStack {
                        TextField("粘贴或输入 48 位 Token", text: $newTokenText)
                            .font(.system(size: 13, design: .monospaced))
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                        
                        if !newTokenText.isEmpty {
                            Button {
                                newTokenText = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.secondary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    
                    HStack(spacing: 12) {
                        Button {
                            if let paste = UIPasteboard.general.string {
                                newTokenText = paste.trimmingCharacters(in: .whitespacesAndNewlines)
                            }
                        } label: {
                            Label("从剪贴板粘贴", systemImage: "doc.on.clipboard")
                                .font(.system(size: 13))
                        }
                        
                        Spacer()
                        
                        Button {
                            addToken()
                        } label: {
                            Text("添加")
                                .font(.system(size: 13, weight: .bold))
                        }
                        .disabled(newTokenText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
                
                // Section 3: 默认配置重置
                Section {
                    Button(role: .destructive) {
                        tokens = AppConfig.defaultTokens
                        StorageManager.shared.saveTokens(tokens)
                        WidgetCenter.shared.reloadAllTimelines()
                        showSuccessAlert = true
                    } label: {
                        Text("恢复默认双账号 Token")
                    }
                }
            }
            .navigationTitle("订阅管理")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") {
                        dismiss()
                    }
                }
            }
            .onAppear {
                tokens = StorageManager.shared.savedTokens
            }
            .alert("配置已重置", isPresented: $showSuccessAlert) {
                Button("确定", role: .cancel) {}
            } message: {
                Text("已恢复默认内置双账号，小组件已同步刷新。")
            }
        }
    }
    
    private func addToken() {
        let trimmed = newTokenText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if !tokens.contains(trimmed) {
            tokens.append(trimmed)
            StorageManager.shared.saveTokens(tokens)
            WidgetCenter.shared.reloadAllTimelines()
        }
        newTokenText = ""
    }
    
    private func deleteToken(at offsets: IndexSet) {
        tokens.remove(atOffsets: offsets)
        StorageManager.shared.saveTokens(tokens)
        WidgetCenter.shared.reloadAllTimelines()
    }
}
