import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@pleadli/ui/components/select"
import { useTheme } from "./theme-provider"
import { m } from '@/paraglide/messages'

export const Toggletheme = () => {
    const { theme, setTheme } = useTheme()

    const items = [
        { value: "light", label: m.ui_light() },
        { value: "dark", label: m.ui_dark() },
        { value: "system", label: m.ui_system() },
    ]

    const handleValueChange = (value: string) => {
        setTheme(value as "light" | "dark" | "system")
    }

    return (
        <Select
            items={items}
            value={theme}
            onValueChange={(value) => handleValueChange(value as string)}
        >
            <SelectTrigger size='sm' className='max-w-xs'>
                <SelectValue placeholder={m.ui_theme()} />
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>
                    {items.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                            {item.label}
                        </SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    )
}