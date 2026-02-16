## 已经和AI说的
只有修改卡片选项才要重新播放， 现在我点展开这些不影响这些粒子的按钮也会重新播放，
然后要一个按钮可以直接跳转到结尾（消散前） 用来观看结束动画

然后bezier的选项重复了， 应用并关闭和应用当前缩放重复， 删掉 应用并关闭
然后S 和 E 的Y轴位置应该有一个横线吸附（然后可以选择关闭吸附，或者按下shift时短暂关闭吸附）

同样这个项目还是没有做好CPU利用率


新建项目的项目名字默认是NewComposition
没有任何默认设置的全局变量， 全局常量
默认卡片1的Single: Particle Init 也不默认设置任何参数，
Single: Controller Init也一样

## 还没和AI说的

支持角度旋转偏差生成，偏差使用 AngleAnimator 计算角度偏差
在applyDisplayAction中
设置
```kotlin
val animator = AngleAnimator(
    glowingTick, finalAngle, Eases.xxx // 曲线设置
)
animator.reset()
```