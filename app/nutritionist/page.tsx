// app/nutritionist/page.tsx
export default function NutritionistHomePage() {
    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">
                Добро пожаловать в кабинет
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Начни с раздела <span className="font-medium">«Мои блюда»</span>: собери
                базу блюд, из которых потом будут строиться рационы.
            </p>
        </div>
    );
}
