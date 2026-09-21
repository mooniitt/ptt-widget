import SwiftUI

// MARK: - Color Hex 扩展支持

public extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - 设计系统与主题引擎

public enum TrafficTheme {
    // 基础背景
    public static let widgetBackground = Color(UIColor { trait in
        trait.userInterfaceStyle == .dark ? UIColor.systemBackground : UIColor.white
    })
    
    // 内容轻量卡片底色 (对齐 JS 的 #F6F7F9)
    public static let cardBackground = Color(UIColor { trait in
        trait.userInterfaceStyle == .dark ? UIColor.secondarySystemGroupedBackground : UIColor(red: 246/255, green: 247/255, blue: 249/255, alpha: 1.0)
    })
    
    // 账号 Tag 底色与文字 (对齐 JS 的 #E5E7EB 与 #374151)
    public static let tagBackground = Color(UIColor { trait in
        trait.userInterfaceStyle == .dark ? UIColor.systemGray5 : UIColor(red: 229/255, green: 231/255, blue: 235/255, alpha: 1.0)
    })
    public static let tagTextColor = Color(UIColor { trait in
        trait.userInterfaceStyle == .dark ? UIColor.label : UIColor(red: 55/255, green: 65/255, blue: 81/255, alpha: 1.0)
    })
    
    // 重置天数 Badge 底色与蓝色 (对齐 JS 的 #F2F4F7 与 #007AFF)
    public static let badgeBackground = Color(UIColor { trait in
        trait.userInterfaceStyle == .dark ? UIColor.systemGray6 : UIColor(red: 242/255, green: 244/255, blue: 247/255, alpha: 1.0)
    })
    public static let badgeBlue = Color(hex: "#007AFF")
    
    // 流量状态三级色阶 (对齐 JS)
    public static let trafficGreen = Color(hex: "#10B981")
    public static let trafficOrange = Color(hex: "#FF9500")
    public static let trafficRed = Color(hex: "#FF3B30")
    
    // 进度条槽底色 (对齐 JS 的 #E5E7EB)
    public static let progressTrack = Color(UIColor { trait in
        trait.userInterfaceStyle == .dark ? UIColor.systemGray5 : UIColor(red: 229/255, green: 231/255, blue: 235/255, alpha: 1.0)
    })
    
    // 次要提示灰 (对齐 JS 的 #8E8E93)
    public static let secondaryText = Color(hex: "#8E8E93")
    
    // 主标题黑 (对齐 JS 的 #1C1C1E)
    public static let primaryText = Color(UIColor { trait in
        trait.userInterfaceStyle == .dark ? UIColor.label : UIColor(red: 28/255, green: 28/255, blue: 30/255, alpha: 1.0)
    })
    
    // 热力图 5 级色阶 (严格对齐 JS 的 LEVEL_COLORS)
    public static let heatmapLevels: [Color] = [
        Color(UIColor { trait in
            trait.userInterfaceStyle == .dark ? UIColor(red: 45/255, green: 51/255, blue: 59/255, alpha: 1.0) : UIColor(red: 235/255, green: 237/255, blue: 240/255, alpha: 1.0)
        }), // Level 0 (#EBEDF0)
        Color(hex: "#9BE9A8"), // Level 1
        Color(hex: "#40C463"), // Level 2
        Color(hex: "#30A14E"), // Level 3
        Color(hex: "#216E39")  // Level 4
    ]
    public static let heatmapWarning = Color(hex: "#FF4D4F")
    
    /// 依据剩余 GB 与使用率计算状态颜色 (1:1 对齐 JS 算法)
    public static func statusColor(remainingGB: Double, usedPercent: Int) -> Color {
        if remainingGB < 5.0 || usedPercent > 90 {
            return trafficRed
        } else if remainingGB < 20.0 || usedPercent > 65 {
            return trafficOrange
        } else {
            return trafficGreen
        }
    }
}

// MARK: - 原生通用组件：进度条 (1:1 对齐 drawProgressBar)

public struct TrafficProgressBar: View {
    public let percent: Int
    public var height: CGFloat = 3.5
    public var customColor: Color? = nil
    
    public init(percent: Int, height: CGFloat = 3.5, customColor: Color? = nil) {
        self.percent = max(0, min(100, percent))
        self.height = height
        self.customColor = customColor
    }
    
    private var fillColor: Color {
        if let c = customColor { return c }
        if percent > 85 { return TrafficTheme.trafficRed }
        if percent > 65 { return TrafficTheme.trafficOrange }
        return TrafficTheme.trafficGreen
    }
    
    public var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(TrafficTheme.progressTrack)
                    .frame(height: height)
                
                if percent > 0 {
                    Capsule()
                        .fill(fillColor)
                        .frame(width: max(height, geo.size.width * CGFloat(Double(percent) / 100.0)), height: height)
                }
            }
        }
        .frame(height: height)
    }
}

// MARK: - 原生通用组件：账号 Tag (A1 / A2)

public struct TrafficTag: View {
    public let text: String
    public var fontSize: CGFloat = 8.5
    public var hPad: CGFloat = 4.0
    public var vPad: CGFloat = 1.0
    public var cornerRadius: CGFloat = 3.5
    
    public init(text: String, fontSize: CGFloat = 8.5, hPad: CGFloat = 4.0, vPad: CGFloat = 1.0, cornerRadius: CGFloat = 3.5) {
        self.text = text
        self.fontSize = fontSize
        self.hPad = hPad
        self.vPad = vPad
        self.cornerRadius = cornerRadius
    }
    
    public var body: some View {
        Text(text)
            .font(.system(size: fontSize, weight: .bold))
            .foregroundStyle(TrafficTheme.tagTextColor)
            .padding(.horizontal, hPad)
            .padding(.vertical, vPad)
            .background(TrafficTheme.tagBackground)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
    }
}

// MARK: - 原生通用组件：重置天数 Badge

public struct TrafficResetBadge: View {
    public let text: String
    public var fontSize: CGFloat = 9.0
    public var hPad: CGFloat = 5.0
    public var vPad: CGFloat = 1.5
    public var cornerRadius: CGFloat = 4.0
    
    public init(text: String, fontSize: CGFloat = 9.0, hPad: CGFloat = 5.0, vPad: CGFloat = 1.5, cornerRadius: CGFloat = 4.0) {
        self.text = text
        self.fontSize = fontSize
        self.hPad = hPad
        self.vPad = vPad
        self.cornerRadius = cornerRadius
    }
    
    public var body: some View {
        Text(text)
            .font(.system(size: fontSize, weight: .medium))
            .foregroundStyle(TrafficTheme.badgeBlue)
            .padding(.horizontal, hPad)
            .padding(.vertical, vPad)
            .background(TrafficTheme.badgeBackground)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
    }
}

// MARK: - 原生通用组件：错误与空状态视图 (1:1 对齐 renderErrorWidget)

public struct ErrorWidgetView: View {
    public let title: String
    public var message: String = "请检查网络或配置"
    
    public init(title: String, message: String = "请检查网络或配置") {
        self.title = title
        self.message = message
    }
    
    public var body: some View {
        VStack(spacing: 3) {
            Spacer()
            Text(title)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(TrafficTheme.trafficRed)
                .multilineTextAlignment(.center)
            
            Text(message)
                .font(.system(size: 9.5))
                .foregroundStyle(TrafficTheme.secondaryText)
                .multilineTextAlignment(.center)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
