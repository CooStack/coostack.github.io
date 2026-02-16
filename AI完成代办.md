## 已经和AI说的
只有修改卡片选项才要重新播放， 现在我点展开这些不影响这些粒子的按钮也会重新播放，
然后要一个按钮可以直接跳转到结尾（消散前） 用来观看结束动画

然后bezier的选项重复了， 应用并关闭和应用当前缩放重复， 删掉 应用并关闭
然后S 和 E 的Y轴位置应该有一个横线吸附（然后可以选择关闭吸附，或者按下shift时短暂关闭吸附）

同样这个项目还是没有做好CPU利用率

然后子点类型设置了之后， 他们对应的参数设置还没有做，

然后每一个卡片都要可以折叠，  display区域，缩放助手，生长动画，axis，shape设置，基础设置这些， 然后在卡片上写一个展开 折叠所有
折叠所有的时候聚焦到了要自动展开

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