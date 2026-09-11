import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@pleadli/ui/components/select"
import { useTheme } from "./theme-provider"

export const Toggletheme = () => {
    const { theme, setTheme } = useTheme()

    const items = [
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
        { value: "system", label: "System" },
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
                <SelectValue placeholder="Theme" />
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