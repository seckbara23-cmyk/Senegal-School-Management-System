'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { updateClass, type UpdateClassState } from '../../actions'

type ClassRow = { id: string; name: string; level: string | null; section: string | null }

function inputClass(hasError: boolean): string {
  return (
    'mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm ' +
    'focus:outline-none focus:ring-1 ' +
    (hasError
      ? 'border-red-400 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 text-gray-900 placeholder-gray-400 focus:border-primary-600 focus:ring-primary-600')
  )
}

function FieldErrors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors || errors.length === 0) return <span id={id} />
  return (
    <ul id={id} className="mt-1 space-y-0.5" role="list">
      {errors.map((msg, i) => <li key={i} className="text-xs text-red-600">{msg}</li>)}
    </ul>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-md bg-primary-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Enregistrement…' : 'Enregistrer les modifications'}
    </button>
  )
}

const initialState: UpdateClassState = {}

export function ClassEditForm({ cls }: { cls: ClassRow }) {
  const [state, formAction] = useFormState(updateClass, initialState)

  return (
    <form action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="class_id" value={cls.id} />

      {state.errors?._form && state.errors._form.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
          {state.errors._form.map((msg, i) => <p key={i} className="text-sm text-red-700">{msg}</p>)}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Nom de la classe <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id="name" name="name" type="text" required defaultValue={cls.name}
          placeholder="ex. CM2, 6ème A, 2nde B"
          aria-describedby="name-errors" aria-invalid={state.errors?.name ? 'true' : undefined}
          className={inputClass(!!state.errors?.name)}
        />
        <FieldErrors id="name-errors" errors={state.errors?.name} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="level" className="block text-sm font-medium text-gray-700">Niveau</label>
          <input
            id="level" name="level" type="text" defaultValue={cls.level ?? ''}
            placeholder="ex. 6ème, Cycle 3"
            aria-describedby="level-errors" className={inputClass(!!state.errors?.level)}
          />
          <FieldErrors id="level-errors" errors={state.errors?.level} />
        </div>
        <div>
          <label htmlFor="section" className="block text-sm font-medium text-gray-700">Section</label>
          <input
            id="section" name="section" type="text" defaultValue={cls.section ?? ''}
            placeholder="ex. A, B"
            aria-describedby="section-errors" className={inputClass(!!state.errors?.section)}
          />
          <FieldErrors id="section-errors" errors={state.errors?.section} />
        </div>
      </div>

      <p className="text-xs text-gray-500">
        <span className="text-red-500" aria-hidden="true">*</span> Champ obligatoire
      </p>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        <SubmitButton />
        <a href={`/school/classes/${cls.id}`} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Annuler</a>
      </div>
    </form>
  )
}
