import SwiftUI

@main
struct PTTApp: App {
    init() {
        // 初始化存储
        _ = StorageManager.shared
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
