import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { fiscalService } from '@/services/fiscal'
import type { Empresa, EmpresaInput, RegimeTributario } from '@/types/erp'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Building2, Save } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

const REGIMES: { valor: RegimeTributario; rotulo: string }[] = [
  { valor: 'simples', rotulo: 'Simples Nacional' },
  { valor: 'presumido', rotulo: 'Lucro Presumido' },
  { valor: 'real', rotulo: 'Lucro Real' },
]

const UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
]

/** Página Empresa — cadastro com regime tributário (exclusiva admin). */
export default function EmpresaPage() {
  const { perfil } = useAuth()
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [form, setForm] = useState<EmpresaInput>({
    razao_social: '',
    cnpj: '',
    ie: '',
    endereco: '',
    cidade: '',
    uf: '',
    email: '',
    telefone: '',
    regime: 'simples',
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fiscalService
      .getEmpresa()
      .then((e) => {
        if (e) {
          setEmpresa(e)
          setForm({
            razao_social: e.razao_social || '',
            cnpj: e.cnpj || '',
            ie: e.ie || '',
            endereco: e.endereco || '',
            cidade: e.cidade || '',
            uf: e.uf || '',
            email: e.email || '',
            telefone: e.telefone || '',
            regime: e.regime || 'simples',
          })
        }
      })
      .catch(() => toast({ title: 'Erro ao carregar dados da empresa', variant: 'destructive' }))
      .finally(() => setIsLoading(false))
  }, [])

  const set = (campo: keyof EmpresaInput, valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }))

  const salvar = async () => {
    if (!form.razao_social.trim()) {
      toast({ title: 'Informe a razão social', variant: 'destructive' })
      return
    }
    setIsSaving(true)
    try {
      const salva = await fiscalService.saveEmpresa(form, empresa?.id)
      setEmpresa(salva)
      toast({ title: 'Dados da empresa salvos' })
    } catch (err: unknown) {
      console.error(err)
      toast({ title: 'Erro ao salvar dados da empresa', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  if (perfil !== 'admin') {
    return <p className="p-6 text-sm text-muted-foreground">Acesso restrito a administradores.</p>
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Building2 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Empresa</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro da empresa; o regime tributário define o cálculo de impostos estimados.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da empresa</CardTitle>
          <CardDescription>
            Usados nas estimativas fiscais (Simples Nacional, Lucro Presumido, Lucro Real).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-1/2" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Razão social *</Label>
                <Input
                  value={form.razao_social}
                  onChange={(e) => set('razao_social', e.target.value)}
                  placeholder="Vittorio Design Indústria de Equipamentos Comerciais Ltda"
                />
              </div>
              <div className="space-y-1.5">
                <Label>CNPJ</Label>
                <Input
                  value={form.cnpj || ''}
                  onChange={(e) => set('cnpj', e.target.value)}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Inscrição Estadual</Label>
                <Input value={form.ie || ''} onChange={(e) => set('ie', e.target.value)} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Endereço</Label>
                <Input
                  value={form.endereco || ''}
                  onChange={(e) => set('endereco', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input value={form.cidade || ''} onChange={(e) => set('cidade', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>UF</Label>
                <Select value={form.uf || undefined} onValueChange={(v) => set('uf', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {UFS.map((uf) => (
                      <SelectItem key={uf} value={uf}>
                        {uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email || ''}
                  onChange={(e) => set('email', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input
                  value={form.telefone || ''}
                  onChange={(e) => set('telefone', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Regime tributário *</Label>
                <Select
                  value={form.regime}
                  onValueChange={(v) => set('regime', v as RegimeTributario)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIMES.map((r) => (
                      <SelectItem key={r.valor} value={r.valor}>
                        {r.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 md:col-span-2 mt-2">
                <Button onClick={salvar} disabled={isSaving} className="gap-1.5">
                  <Save className="h-4 w-4" />
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
