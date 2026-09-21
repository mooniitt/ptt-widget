import SwiftUI

// MARK: - 原生轻量呼吸微光修饰符 (KISS 原则，原生省电流畅)

public struct ShimmerModifier: ViewModifier {
    @State private var isAnimating: Bool = false
    
    public func body(content: Content) -> some View {
        content
            .opacity(isAnimating ? 0.35 : 0.75)
            .animation(
                Animation.easeInOut(duration: 0.9)
                    .repeatForever(autoreverses: true),
                value: isAnimating
            )
            .onAppear {
                isAnimating = true
            }
    }
}

public extension View {
    func skeletonShimmer() -> some View {
        self.modifier(ShimmerModifier())
    }
}

// MARK: - 高保真账号骨架卡片视图 (1:1 对齐真实卡片几何结构)

public struct SkeletonTrafficCardView: View {
    public init() {}
    
    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // 1. 卡片头部骨架
            HStack {
                HStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(uiColor: .systemGray4))
                        .frame(width: 26, height: 18)
                    
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(uiColor: .systemGray4))
                        .frame(width: 140, height: 18)
                }
                
                Spacer()
                
                Capsule()
                    .fill(Color(uiColor: .systemGray5))
                    .frame(width: 75, height: 22)
            }
            
            Divider()
                .opacity(0.5)
            
            // 2. 核心指标骨架
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(uiColor: .systemGray5))
                        .frame(width: 48, height: 11)
                    
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color(uiColor: .systemGray4))
                        .frame(width: 110, height: 32)
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 5) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(uiColor: .systemGray4))
                        .frame(width: 120, height: 13)
                    
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(uiColor: .systemGray5))
                        .frame(width: 90, height: 11)
                }
            }
            
            // 3. 进度条骨架
            Capsule()
                .fill(Color(uiColor: .systemGray5))
                .frame(height: 7)
            
            // 4. 热力图板块骨架
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(uiColor: .systemGray4))
                        .frame(width: 95, height: 12)
                    Spacer()
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(uiColor: .systemGray5))
                        .frame(width: 80, height: 12)
                }
                
                // 星期表头骨架
                HStack(spacing: 3.5) {
                    ForEach(0..<7, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color(uiColor: .systemGray5))
                            .frame(width: 13, height: 9)
                    }
                }
                
                // 4 行 7 列日历网格骨架
                VStack(spacing: 3.5) {
                    ForEach(0..<4, id: \.self) { _ in
                        HStack(spacing: 3.5) {
                            ForEach(0..<7, id: \.self) { _ in
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(Color(uiColor: .systemGray5))
                                    .frame(width: 13, height: 13)
                            }
                        }
                    }
                }
                .padding(.vertical, 2)
            }
            .padding(10)
            .background(TrafficTheme.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .padding(14)
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: Color.black.opacity(0.04), radius: 6, x: 0, y: 2)
        .skeletonShimmer()
    }
}
